// Clientul pentru POSLink (Intelectsoft): terminalul bancar Android în „regim fiscal” (de ex. PAX A930
// cu IS Fiscal) primește prin acest API atât plata cu cardul, cât și bonul fiscal de tipărit.
// Documentație: https://poslink.eservicii.md/POSLink/api-docs.html și documentația ISFiscalService
// (structura bonului, codurile de plată, literele de TVA).

import { randomUUID } from 'node:crypto';
import { EroareUtilizator } from '../erori';

export interface ConfigPOSLink {
  url: string;
  cheie: string;
}

/**
 * Cheia API și aprobările plăților circulă doar criptat: o adresă http:// e refuzată, în afară de
 * mașina locală (un POSLink simulat în teste sau în dezvoltare).
 */
export function configPOSLink(): ConfigPOSLink | null {
  const cheie = process.env.POSLINK_API_KEY;
  if (!cheie) return null;
  const url = (process.env.POSLINK_URL ?? 'https://poslink.eservicii.md/POSLink').replace(/\/$/, '');
  verificaAdresaPOSLink(url);
  return { url, cheie };
}

export function verificaAdresaPOSLink(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`POSLINK_URL nu este o adresă validă: ${url}`);
  }
  const local = u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    throw new Error('POSLINK_URL trebuie să fie https:// (http:// doar pentru 127.0.0.1 sau localhost)');
  }
}

/** Cât citim, cel mult, dintr-un răspuns POSLink (octeți): un răspuns normal are câțiva KB. */
export const LIMITA_RASPUNS_POSLINK = 1024 * 1024;

/** Citește corpul răspunsului până la `limita` octeți; peste ea, cererea se întrerupe. */
async function citesteLimitat(r: Response, limita: number): Promise<string> {
  if (!r.body) return '';
  const cititor = r.body.getReader();
  const bucati: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await cititor.read();
    if (done) break;
    total += value.length;
    if (total > limita) {
      await cititor.cancel().catch(() => {});
      throw new EroarePOSLink(-1, 'POSLink a trimis un răspuns prea mare');
    }
    bucati.push(value);
  }
  const tot = new Uint8Array(total);
  let poz = 0;
  for (const b of bucati) {
    tot.set(b, poz);
    poz += b.length;
  }
  return new TextDecoder().decode(tot);
}

/** Răspunsul standard POSLink: errorCode 0 = succes; `report` vine ca text JSON. */
interface RaspunsPOSLink {
  errorCode: number;
  errorName?: string;
  errorMessage?: string;
  report?: string | Record<string, unknown> | null;
  [k: string]: unknown;
}

const MESAJE: Record<number, string> = {
  10: 'Cheia API POSLink lipsește sau a fost respinsă',
  165: 'Tranzacția nu a fost găsită pe terminal',
  184: 'Terminalul este blocat în cabinetul POSLink',
  241: 'Terminalul nu răspunde (oprit sau fără conexiune)',
  242: 'Compania este dezactivată în POSLink',
};

export class EroarePOSLink extends EroareUtilizator {
  constructor(
    public cod: number,
    mesaj: string,
  ) {
    super(mesaj, 502);
  }
}

export interface RezultatPlata {
  aprobat: boolean;
  autorizare?: string;
  rrn?: string;
  operation_id?: string;
  mesaj?: string;
  /** true când aprobarea a fost regăsită prin „ultima tranzacție”, după un răspuns pierdut. */
  recuperata?: boolean;
  /**
   * Rezultatul nu se poate confirma (răspuns pierdut, „ultima tranzacție” neconcludentă): plata NU se
   * consideră făcută, dar nici refuzată. O nouă încercare cu aceeași referință verifică din nou, fără să
   * trimită suma a doua oară la terminal.
   */
  nesigur?: boolean;
}

export const MESAJ_NESIGUR = 'Nu se poate confirma plata: verificați ecranul terminalului și chitanța băncii';

export interface LinieBonFiscal {
  nume: string;
  cantitate: number;
  pret_unitar: number;
  cota_tva: string;
  cod?: string;
}

export interface BonFiscalDeTrimis {
  /** Identificatorul comenzii: POSLink/ISFiscal refuză un al doilea bon cu același Uid (cod 46). */
  uid: string;
  numar: string;
  linii: LinieBonFiscal[];
  metoda: 'numerar' | 'card';
  total: number;
  primit?: number | null;
  card?: { rrn?: string | null; autorizare?: string | null } | null;
  antet?: string | null;
}

export interface RezultatBon {
  ok: boolean;
  qr?: string;
  receipt_id?: string;
  mesaj?: string;
  /** Bonul exista deja pe terminal (același Uid): nu s-a tipărit a doua oară. */
  deja_emis?: boolean;
}

/** Codurile de plată MEV: 1 numerar, 2 card. Restul schimbului se dă doar din numerar. */
const COD_NUMERAR = '1';
const COD_CARD = '2';

export class ClientPOSLink {
  constructor(
    private cfg: ConfigPOSLink,
    private fetchFn: typeof fetch = fetch,
  ) {}

  private async cere<T = RaspunsPOSLink>(metoda: 'GET' | 'POST', cale: string, date: Record<string, unknown>, timeoutMs: number): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      let r: Response;
      if (metoda === 'GET') {
        const q = new URLSearchParams({ APIKey: this.cfg.cheie, ...Object.fromEntries(Object.entries(date).map(([k, v]) => [k, String(v)])) });
        r = await this.fetchFn(`${this.cfg.url}${cale}?${q}`, { signal: ctrl.signal });
      } else {
        r = await this.fetchFn(`${this.cfg.url}${cale}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ APIKey: this.cfg.cheie, ...date }),
          signal: ctrl.signal,
        });
      }
      const text = await citesteLimitat(r, LIMITA_RASPUNS_POSLINK);
      let corp: any;
      try {
        corp = JSON.parse(text);
      } catch {
        throw new EroarePOSLink(-1, `POSLink a răspuns neașteptat (${r.status})`);
      }
      if (typeof corp.report === 'string') {
        try {
          corp.report = JSON.parse(corp.report);
        } catch {
          /* raportul poate fi text simplu */
        }
      }
      return corp as T;
    } catch (e) {
      if (e instanceof EroarePOSLink) throw e;
      if ((e as Error).name === 'AbortError') throw new EroarePOSLink(241, 'Nu a venit niciun răspuns de la POSLink în timpul așteptat');
      throw new EroarePOSLink(-1, `Nu s-a putut contacta POSLink: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private verifica(r: RaspunsPOSLink, context: string): void {
    if (r.errorCode === 0) return;
    throw new EroarePOSLink(r.errorCode, `${context}: ${MESAJE[r.errorCode] ?? r.errorMessage ?? r.errorName ?? `eroare ${r.errorCode}`}`);
  }

  /** Starea terminalului: online, baterie, hârtie, bancă, semnal. */
  async stare(deviceId: string): Promise<Record<string, unknown>> {
    const r = await this.cere('GET', '/Device/Device/Status', { DeviceID: deviceId }, 25_000);
    this.verifica(r, 'Starea terminalului');
    return (r.report as Record<string, unknown>) ?? {};
  }

  /**
   * Plata cu cardul: suma apare pe terminal, clientul apropie cardul (până la 5 minute).
   * Dacă răspunsul se pierde, întrebăm terminalul de ultima tranzacție înainte de a declara
   * refuz, ca să nu-i cerem clientului să plătească de două ori. După aprobare, CloseDoc
   * eliberează terminalul pentru următoarea tranzacție.
   */
  async plateste(deviceId: string, suma: number, documentNr: string): Promise<RezultatPlata> {
    let r: RaspunsPOSLink;
    try {
      r = await this.cere('POST', '/Device/payment/Pay', { DeviceID: deviceId, amount: suma, documentNr }, 5.5 * 60_000);
    } catch (e) {
      // Răspunsul s-a pierdut: plata poate să fi trecut. Doar terminalul poate spune.
      if (e instanceof EroarePOSLink && e.cod === 241) return this.verificaPlata(deviceId, documentNr, suma, e.message);
      throw e;
    }
    if (r.errorCode === 241) return this.verificaPlata(deviceId, documentNr, suma, MESAJE[241]);
    if (r.errorCode !== 0) return { aprobat: false, mesaj: MESAJE[r.errorCode] ?? r.errorMessage ?? `Refuzat (${r.errorCode})` };
    const rap = (r.report ?? {}) as Record<string, any>;
    // Un „succes” fără RRN și cod de autorizare nu e o aprobare: se verifică pe terminal.
    if (!rap.rrn || !rap.authCode) return this.verificaPlata(deviceId, documentNr, suma, null);
    const rezultat: RezultatPlata = { aprobat: true, autorizare: String(rap.authCode), rrn: String(rap.rrn), operation_id: rap.operationId ? String(rap.operationId) : undefined };
    await this.inchideDocument(deviceId, documentNr, rezultat.operation_id).catch(() => {});
    return rezultat;
  }

  /**
   * Verifică o operațiune al cărei rezultat nu se știe, după „ultima tranzacție” a terminalului.
   * Întoarce aprobarea (recuperata), un refuz definitiv sau `nesigur`; niciodată nu trimite din nou suma.
   * `mesajAbsenta`: mesajul (refuz) când ultima tranzacție e alta, deci operațiunea noastră nu a ajuns la
   * terminal; null când terminalul a răspuns deja „succes” și o lipsă înseamnă doar că nu se poate confirma.
   */
  async verificaPlata(deviceId: string, documentNr: string, suma: number, mesajAbsenta: string | null): Promise<RezultatPlata> {
    let gasita: RezultatVerificare;
    try {
      gasita = await this.cautaInUltimaTranzactie(deviceId, documentNr, suma);
    } catch {
      gasita = { stare: 'nesigura' };
    }
    if (gasita.stare === 'aprobata') {
      await this.inchideDocument(deviceId, documentNr, gasita.rezultat.operation_id).catch(() => {});
      return { ...gasita.rezultat, recuperata: true };
    }
    if (gasita.stare === 'refuzata') return { aprobat: false, mesaj: 'Plata a fost refuzată pe terminal' };
    if (gasita.stare === 'absenta' && mesajAbsenta) return { aprobat: false, mesaj: mesajAbsenta };
    return { aprobat: false, nesigur: true, mesaj: MESAJ_NESIGUR };
  }

  /**
   * Schema răspunsului „ultima tranzacție” nu e publicată: îl citim defensiv. O aprobare se acceptă doar
   * cu referința noastră, cu aprobarea explicită, cu RRN și cu aceeași sumă; o tranzacție a altui client
   * de aceeași sumă nu mai trece drept plata noastră.
   */
  private async cautaInUltimaTranzactie(deviceId: string, documentNr: string, suma: number): Promise<RezultatVerificare> {
    const r = await this.cere('GET', '/Device/payment/LastTransaction', { DeviceId: deviceId }, 30_000);
    // Nicio tranzacție pe terminal: a noastră nu a ajuns acolo.
    if (r.errorCode === 165) return { stare: 'absenta' };
    if (r.errorCode !== 0) return { stare: 'nesigura' };
    const rap = aplatizeaza((r.report ?? r) as Record<string, unknown>);
    const doc = rap.documentnr ?? rap.documentnumber ?? rap.document;
    if (doc == null) return { stare: 'nesigura' };
    if (String(doc).toLowerCase() !== documentNr.toLowerCase()) return { stare: 'absenta' };
    const stare = String(rap.status ?? rap.state ?? rap.result ?? rap.transactionstatus ?? '').toLowerCase();
    const cod = rap.responsecode ?? rap.rc;
    const aprobata = rap.approved === true || ['approved', 'success', 'successful', 'ok'].includes(stare) || ['00', '000'].includes(String(cod ?? ''));
    // Refuz doar la un semnal explicit (approved: false sau un cuvânt de refuz): după un refuz se poate
    // trimite o plată nouă, deci un cod de răspuns necunoscut (0, '0', 'A0'…) lasă plata nesigură.
    const refuzata = rap.approved === false || CUVINTE_REFUZ.includes(stare);
    if (refuzata) return aprobata ? { stare: 'nesigura' } : { stare: 'refuzata' };
    const amount = Number(rap.amount);
    if (!aprobata || rap.rrn == null || rap.rrn === '' || !Number.isFinite(amount) || Math.abs(amount - suma) > 0.001) return { stare: 'nesigura' };
    return {
      stare: 'aprobata',
      rezultat: {
        aprobat: true,
        autorizare: rap.authcode != null ? String(rap.authcode) : undefined,
        rrn: String(rap.rrn),
        operation_id: rap.operationid != null ? String(rap.operationid) : undefined,
      },
    };
  }

  async inchideDocument(deviceId: string, documentNr: string, operationId?: string): Promise<void> {
    const r = await this.cere('POST', '/Device/payment/CloseDoc', { DeviceID: deviceId, documentNr, operationId: operationId ?? '' }, 60_000);
    this.verifica(r, 'Închiderea documentului pe terminal');
  }

  /** Restituire pe card (ziua bancară deschisă): are nevoie de RRN și de operationId ale plății. */
  async restituie(deviceId: string, suma: number, plata: { rrn?: string | null; operation_id?: string | null }, documentNr: string): Promise<RezultatPlata> {
    if (!plata.rrn) return { aprobat: false, mesaj: 'Plata originală nu are RRN; restituirea se face manual pe terminal' };
    let r: RaspunsPOSLink;
    try {
      r = await this.cere('POST', '/Device/payment/Refund', { DeviceID: deviceId, documentNr, operationId: plata.operation_id ?? '', rrn: plata.rrn, amount: suma, currency: 'MDL' }, 90_000);
    } catch (e) {
      // Răspuns pierdut: returul poate să fi trecut; se verifică înainte de orice nouă trimitere.
      if (e instanceof EroarePOSLink && e.cod === 241) return { aprobat: false, nesigur: true, mesaj: 'Nu se poate confirma returul: verificați ecranul terminalului' };
      throw e;
    }
    if (r.errorCode === 241) return { aprobat: false, nesigur: true, mesaj: 'Nu se poate confirma returul: verificați ecranul terminalului' };
    if (r.errorCode !== 0) return { aprobat: false, mesaj: MESAJE[r.errorCode] ?? r.errorMessage ?? `Refuzat (${r.errorCode})` };
    const rap = (r.report ?? {}) as Record<string, any>;
    return { aprobat: true, autorizare: rap.authCode ? String(rap.authCode) : undefined, rrn: rap.rrn ? String(rap.rrn) : undefined, operation_id: rap.operationId ? String(rap.operationId) : undefined };
  }

  /** Închiderea zilei bancare (settlement). */
  async inchideZiuaBancara(deviceId: string): Promise<void> {
    const r = await this.cere('POST', '/Device/payment/closeDay', { DeviceID: deviceId }, 90_000);
    this.verifica(r, 'Închiderea zilei bancare');
  }

  /** Bonul fiscal, tipărit de terminal în regim fiscal. */
  async bonFiscal(deviceId: string, bon: BonFiscalDeTrimis, callback?: string): Promise<RezultatBon> {
    const Receipt = construiesteBon(bon);
    const r = await this.cere('POST', '/Device/Invoice/Pay', { DeviceID: deviceId, Receipt, ...(callback ? { CallbackURI: callback } : {}) }, 90_000);
    // Doar codul 46 înseamnă „bon cu același Uid deja emis”; orice altă eroare (chiar dacă pomenește
    // Uid-ul, de ex. un format respins) lasă bonul netipărit, ca să apară „Bon netipărit” pe tabletă.
    if (r.errorCode === 46) {
      return { ok: true, deja_emis: true, mesaj: 'Bonul fusese deja emis' };
    }
    if (r.errorCode !== 0) return { ok: false, mesaj: MESAJE[r.errorCode] ?? r.errorMessage ?? `Eroare ${r.errorCode}` };
    const rap = (r.report ?? {}) as Record<string, any>;
    return { ok: true, qr: rap.QR ?? rap.qr ?? (r as any).QR, receipt_id: rap.ReceiptID ?? rap.receiptId ?? (r as any).ReceiptID };
  }

  /** Raport Z (fiscal=true) sau X. */
  async raport(deviceId: string, z: boolean): Promise<void> {
    const r = await this.cere('POST', '/Device/Report/Create', { DeviceID: deviceId, Fiscal: z }, 60_000);
    this.verifica(r, z ? 'Raportul Z' : 'Raportul X');
  }

  /** Depunere (+) sau ridicare (−) de numerar înregistrată pe casa fiscală. */
  async bani(deviceId: string, suma: number, motiv: string): Promise<void> {
    const cale = suma >= 0 ? '/Device/Money/In' : '/Device/Money/Out';
    const r = await this.cere('POST', cale, { DeviceID: deviceId, Amount: Math.abs(suma), Reason: motiv }, 30_000);
    this.verifica(r, 'Operațiunea de numerar pe casa fiscală');
  }
}

/** Stările „ultimei tranzacții” care înseamnă refuz sigur. */
const CUVINTE_REFUZ = ['declined', 'refused', 'rejected', 'denied', 'canceled', 'cancelled'];

type RezultatVerificare = { stare: 'aprobata'; rezultat: RezultatPlata } | { stare: 'refuzata' | 'absenta' | 'nesigura' };

function aplatizeaza(o: Record<string, unknown>): Record<string, unknown> {
  const rez: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(rez, aplatizeaza(v as Record<string, unknown>));
    else rez[k.toLowerCase()] = v;
  }
  return rez;
}

/**
 * Structura bonului după ISFiscalService (RegisterFiscalReceipt), pe care POSLink o trimite
 * terminalului: linii cu Name/Quantity/Price/VAT și plăți cu Code/Amount (+ RRN pentru card).
 * Prețul unitar include opțiunile; cantitatea e pe linie. Restul se calculează pe terminal
 * din plata în numerar, deci la numerar trimitem suma primită.
 */
export function construiesteBon(bon: BonFiscalDeTrimis) {
  const Items = bon.linii.map((l) => ({
    Name: l.nume.slice(0, 120),
    Quantity: Math.round(l.cantitate * 1000) / 1000,
    Price: Math.round(l.pret_unitar * 100) / 100,
    VAT: l.cota_tva,
    ...(l.cod ? { Code: l.cod } : {}),
  }));
  const total = Math.round(bon.total * 100) / 100;
  const Payments =
    bon.metoda === 'card'
      ? [{ Code: COD_CARD, Amount: total, RRN: bon.card?.rrn ?? '', BankResponse: bon.card?.autorizare ?? '' }]
      : [{ Code: COD_NUMERAR, Amount: Math.max(total, Math.round((bon.primit ?? total) * 100) / 100) }];
  return {
    Number: bon.numar,
    Uid: bon.uid,
    Items,
    Lines: Items,
    Payments,
    DisplayType: 0,
    ...(bon.antet ? { HeaderText: bon.antet } : {}),
  };
}

export const uuidDocument = () => randomUUID();
