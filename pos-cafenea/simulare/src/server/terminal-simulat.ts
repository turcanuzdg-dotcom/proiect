// Terminalul PAX A930 cu IS Fiscal, simulat: răspunde ca POSLink (aceleași căi și coduri ca
// server/src/servicii/poslink.ts), iar plata cu cardul așteaptă ca utilizatorul să „apropie cardul”
// pe terminalul desenat în pagină. Bonurile și rapoartele „ies” pe hârtia terminalului.

export type EcranPAX =
  | { tip: 'repaus' }
  | { tip: 'plata'; suma: number }
  | { tip: 'autorizare'; suma: number }
  | { tip: 'aprobat'; suma: number; autorizare: string }
  | { tip: 'refuzat'; suma: number; mesaj: string }
  | { tip: 'retur'; suma: number }
  | { tip: 'tiparire'; ce: string };

export interface RandHartie {
  text: string;
  suma?: string;
  stil?: 'titlu' | 'gros' | 'mic' | 'linie';
}

export interface Hartie {
  id: number;
  titlu: string;
  ora: string;
  randuri: RandHartie[];
  qr?: string;
}

export interface StareTerminal {
  ecran: EcranPAX;
  hartii: Hartie[];
}

export interface EvenimentTerminal {
  tip: 'plata_ceruta' | 'plata_aprobata' | 'plata_refuzata' | 'bon' | 'raport_z' | 'zi_bancara' | 'retur';
  text: string;
}

interface ItemBon {
  Name: string;
  Quantity: number;
  Price: number;
  VAT: string;
}
interface PlataBon {
  Code: string;
  Amount: number;
  RRN?: string;
  BankResponse?: string;
}

const lei = (n: number) => n.toLocaleString('ro-MD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ora = () => new Date().toLocaleTimeString('ro-MD', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Chisinau' });
const data = () => new Date().toLocaleDateString('ro-MD', { timeZone: 'Europe/Chisinau' });
const asteapta = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rotunjeste = (n: number) => Math.round(n * 100) / 100;

export class TerminalSimulat {
  private stare: StareTerminal = { ecran: { tip: 'repaus' }, hartii: [] };
  private ascultatori = new Set<() => void>();
  private ascultatoriEvenimente = new Set<(e: EvenimentTerminal) => void>();
  private decizie: ((aprobat: boolean | null) => void) | null = null;
  private nrHartie = 0;
  private nrTranzactie = 0;
  private nrBon = 0;
  private uiduri = new Set<string>();
  private ultima: Record<string, unknown> | null = null;
  // Totalurile de la ultimul raport Z și de la ultima închidere a zilei bancare.
  private zi = { bonuri: 0, numerar: 0, card: 0, tva: new Map<string, number>() };
  private banca = { tranzactii: 0, total: 0, retururi: 0 };

  citeste = () => this.stare;
  aboneaza = (f: () => void) => {
    this.ascultatori.add(f);
    return () => void this.ascultatori.delete(f);
  };
  laEveniment(f: (e: EvenimentTerminal) => void) {
    this.ascultatoriEvenimente.add(f);
    return () => void this.ascultatoriEvenimente.delete(f);
  }

  private schimba(s: Partial<StareTerminal>) {
    this.stare = { ...this.stare, ...s };
    this.ascultatori.forEach((f) => f());
  }
  private anunta(e: EvenimentTerminal) {
    this.ascultatoriEvenimente.forEach((f) => f(e));
  }
  private revinoInRepaus(dupaMs: number, daca: EcranPAX['tip']) {
    setTimeout(() => {
      if (this.stare.ecran.tip === daca) this.schimba({ ecran: { tip: 'repaus' } });
    }, dupaMs);
  }
  private tipareste(h: Omit<Hartie, 'id' | 'ora'>) {
    this.nrHartie += 1;
    this.schimba({ hartii: [{ ...h, id: this.nrHartie, ora: `${data()} ${ora()}` }, ...this.stare.hartii].slice(0, 30) });
  }

  /** Butoanele de pe ecranul terminalului. */
  apropieCardul = () => this.decizie?.(true);
  refuzaCardul = () => this.decizie?.(false);

  /** fetch-ul pe care îl primește ClientPOSLink în locul rețelei. */
  fetch = (async (intrare: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(intrare));
    const cale = url.pathname.replace(/^\/POSLink/, '');
    const corp = init?.body ? JSON.parse(String(init.body)) : Object.fromEntries(url.searchParams);
    switch (cale) {
      case '/Device/Device/Status':
        return ok({ online: true, battery: 87, paper: 'OK', bank: 'Banca (simulare)', signal: 4 });
      case '/Device/payment/Pay':
        return this.plata(Number(corp.amount), String(corp.documentNr), init?.signal ?? undefined);
      case '/Device/payment/CloseDoc':
        return ok();
      case '/Device/payment/LastTransaction':
        return this.ultima ? ok(this.ultima) : raspuns({ errorCode: 165, errorName: 'Transaction_not_found' });
      case '/Device/payment/Refund':
        return this.retur(Number(corp.amount));
      case '/Device/payment/closeDay':
        return this.inchideZiuaBancara();
      case '/Device/Invoice/Pay':
        return this.bon(corp.Receipt);
      case '/Device/Report/Create':
        return this.raport(corp.Fiscal === true);
      case '/Device/Money/In':
      case '/Device/Money/Out':
        return ok();
      default:
        return raspuns({ errorCode: -1, errorMessage: `Comandă necunoscută ${cale}` });
    }
  }) as typeof fetch;

  private async plata(suma: number, documentNr: string, semnal?: AbortSignal) {
    this.decizie?.(null);
    this.schimba({ ecran: { tip: 'plata', suma } });
    this.anunta({ tip: 'plata_ceruta', text: `Serverul a trimis ${lei(suma)} lei la terminal; se așteaptă cardul clientului` });
    const aprobat = await new Promise<boolean | null>((rezolva) => {
      this.decizie = rezolva;
      semnal?.addEventListener('abort', () => rezolva(null));
    });
    this.decizie = null;
    if (aprobat === null) {
      this.schimba({ ecran: { tip: 'repaus' } });
      throw new DOMException('Plata a expirat', 'AbortError');
    }
    this.schimba({ ecran: { tip: 'autorizare', suma } });
    await asteapta(1300);
    if (!aprobat) {
      this.schimba({ ecran: { tip: 'refuzat', suma, mesaj: 'Fonduri insuficiente' } });
      this.revinoInRepaus(3500, 'refuzat');
      this.anunta({ tip: 'plata_refuzata', text: `Banca a refuzat plata de ${lei(suma)} lei` });
      return raspuns({ errorCode: 51, errorMessage: 'Tranzacție refuzată de bancă: fonduri insuficiente' });
    }
    this.nrTranzactie += 1;
    const autorizare = String(100000 + Math.floor(Math.random() * 900000));
    const rrn = `${new Date().getFullYear() % 100}${String(Date.now()).slice(-6)}${String(this.nrTranzactie).padStart(4, '0')}`;
    const operationId = `op-${Date.now()}-${this.nrTranzactie}`;
    this.ultima = { documentNr, amount: suma, rrn, authCode: autorizare, operationId };
    this.banca.tranzactii += 1;
    this.banca.total = rotunjeste(this.banca.total + suma);
    this.schimba({ ecran: { tip: 'aprobat', suma, autorizare } });
    this.revinoInRepaus(3000, 'aprobat');
    this.anunta({ tip: 'plata_aprobata', text: `Plată aprobată: ${lei(suma)} lei, cod de autorizare ${autorizare}` });
    return ok({ rrn, authCode: autorizare, operationId, amount: suma });
  }

  private async retur(suma: number) {
    this.schimba({ ecran: { tip: 'retur', suma } });
    await asteapta(1500);
    this.banca.retururi = rotunjeste(this.banca.retururi + suma);
    this.schimba({ ecran: { tip: 'repaus' } });
    this.tipareste({ titlu: 'RETUR PE CARD', randuri: [{ text: 'Suma restituită', suma: lei(suma), stil: 'gros' }, { text: 'Banii revin pe cardul clientului.', stil: 'mic' }] });
    this.anunta({ tip: 'retur', text: `Retur pe card: ${lei(suma)} lei` });
    return ok({ rrn: `R${Date.now() % 1e10}`, authCode: String(100000 + Math.floor(Math.random() * 900000)), operationId: `op-r-${Date.now()}` });
  }

  private async bon(r: { Number: string; Uid: string; Items: ItemBon[]; Payments: PlataBon[]; HeaderText?: string }) {
    if (this.uiduri.has(r.Uid)) return raspuns({ errorCode: 46, errorMessage: 'Uid already exists' });
    this.uiduri.add(r.Uid);
    this.schimba({ ecran: { tip: 'tiparire', ce: 'bonul fiscal' } });
    await asteapta(700);
    this.nrBon += 1;
    const total = rotunjeste(r.Items.reduce((s, i) => s + i.Price * i.Quantity, 0));
    const randuri: RandHartie[] = [];
    if (r.HeaderText) randuri.push({ text: r.HeaderText, stil: 'mic' });
    randuri.push({ text: `Bon nr. ${this.nrBon} · comanda ${r.Number}`, stil: 'mic' }, { text: '', stil: 'linie' });
    for (const i of r.Items) {
      randuri.push({ text: i.Name, suma: `${lei(rotunjeste(i.Price * i.Quantity))} ${i.VAT}` });
      if (i.Quantity !== 1) randuri.push({ text: `  ${i.Quantity} × ${lei(i.Price)}`, stil: 'mic' });
    }
    randuri.push({ text: '', stil: 'linie' }, { text: 'TOTAL', suma: lei(total), stil: 'gros' });
    for (const p of r.Payments) {
      if (p.Code === '2') {
        randuri.push({ text: 'Card bancar', suma: lei(p.Amount) }, { text: `RRN ${p.RRN || '–'} · autorizare ${p.BankResponse || '–'}`, stil: 'mic' });
        this.zi.card = rotunjeste(this.zi.card + total);
      } else {
        randuri.push({ text: 'Numerar', suma: lei(p.Amount) });
        if (p.Amount > total) randuri.push({ text: 'Rest', suma: lei(rotunjeste(p.Amount - total)) });
        this.zi.numerar = rotunjeste(this.zi.numerar + total);
      }
    }
    const tvaA = rotunjeste((total * 20) / 120);
    randuri.push({ text: 'TVA A = 20%', suma: lei(tvaA), stil: 'mic' });
    this.zi.bonuri += 1;
    this.zi.tva.set('A', rotunjeste((this.zi.tva.get('A') ?? 0) + tvaA));
    const qr = `SIMULARE-${this.nrBon}-${r.Uid.slice(0, 8)}`;
    this.tipareste({ titlu: 'BON FISCAL (SIMULARE)', randuri, qr });
    this.schimba({ ecran: { tip: 'repaus' } });
    this.anunta({ tip: 'bon', text: `Terminalul a tipărit bonul fiscal nr. ${this.nrBon} (${lei(total)} lei)` });
    return ok({ QR: qr, ReceiptID: `bon-${this.nrBon}` });
  }

  private async raport(z: boolean) {
    this.schimba({ ecran: { tip: 'tiparire', ce: z ? 'raportul Z' : 'raportul X' } });
    await asteapta(900);
    const total = rotunjeste(this.zi.numerar + this.zi.card);
    this.tipareste({
      titlu: z ? 'RAPORT Z (SIMULARE)' : 'RAPORT X (SIMULARE)',
      randuri: [
        { text: `Bonuri emise`, suma: String(this.zi.bonuri) },
        { text: 'Numerar', suma: lei(this.zi.numerar) },
        { text: 'Card', suma: lei(this.zi.card) },
        { text: '', stil: 'linie' },
        { text: 'TOTAL VÂNZĂRI', suma: lei(total), stil: 'gros' },
        { text: 'din care TVA A 20%', suma: lei(this.zi.tva.get('A') ?? 0), stil: 'mic' },
        { text: z ? 'Ziua fiscală a fost închisă.' : 'Raport informativ, ziua rămâne deschisă.', stil: 'mic' },
      ],
    });
    if (z) this.zi = { bonuri: 0, numerar: 0, card: 0, tva: new Map() };
    this.schimba({ ecran: { tip: 'repaus' } });
    this.anunta({ tip: 'raport_z', text: z ? `Terminalul a tipărit raportul Z: ${lei(total)} lei` : 'Terminalul a tipărit raportul X' });
    return ok();
  }

  private async inchideZiuaBancara() {
    this.schimba({ ecran: { tip: 'tiparire', ce: 'închiderea zilei bancare' } });
    await asteapta(900);
    this.tipareste({
      titlu: 'ÎNCHIDEREA ZILEI BANCARE',
      randuri: [
        { text: 'Plăți cu cardul', suma: String(this.banca.tranzactii) },
        { text: 'Total încasat', suma: lei(this.banca.total), stil: 'gros' },
        { text: 'Retururi', suma: lei(this.banca.retururi) },
        { text: 'Banca virează suma în contul firmei.', stil: 'mic' },
      ],
    });
    const plati = this.banca.tranzactii === 1 ? 'o plată' : `${this.banca.tranzactii} plăți`;
    this.anunta({ tip: 'zi_bancara', text: `Ziua bancară închisă: ${plati} cu cardul, ${lei(this.banca.total)} lei` });
    this.banca = { tranzactii: 0, total: 0, retururi: 0 };
    this.schimba({ ecran: { tip: 'repaus' } });
    return ok();
  }
}

function raspuns(o: unknown) {
  return new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function ok(report?: unknown) {
  return raspuns({ errorCode: 0, report: report === undefined ? null : JSON.stringify(report) });
}
