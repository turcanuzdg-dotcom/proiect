// Starea paginii de simulare: Wi-Fi-ul tabletei, jurnalul „cine ce trimite”, pașii ghidului
// bifați pe măsură ce se fac, și a doua cafenea care vinde singură în fundal.
import type { CatalogPOS, EvenimentPOS, LinieComanda } from '@cafenea/shared';
import { ETICHETE_MOTIVE, formatLei, totalComanda, type MotivCasare } from '@cafenea/shared';
import type { CerereCatreServer, PunteSimulare, RaspunsServer, SursaCerere } from '../punte-tipuri';
import type { ServerSim } from '../server/pornire';

export type Actor = 'tableta' | 'terminal' | 'server' | 'panou' | 'botanica' | 'simulare';

export interface IntrareJurnal {
  id: number;
  ora: string;
  actor: Actor;
  text: string;
  ton?: 'atentie' | 'bine';
}

export const PASI = ['tura', 'numerar', 'card', 'casare', 'panou', 'offline', 'sincronizare', 'inchidere', 'rapoarte'] as const;
export type IdPas = (typeof PASI)[number];

export interface StareSimulare {
  internet: boolean;
  botanica: boolean;
  /** Operațiile pe care tableta le ține în memorie cât e fără internet. */
  inTableta: number;
  jurnal: IntrareJurnal[];
  facute: Partial<Record<IdPas, string>>;
}

const ora = () => new Date().toLocaleTimeString('ro-MD', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Chisinau' });
const pauza = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Simulare {
  private stare: StareSimulare = { internet: true, botanica: true, inTableta: 0, jurnal: [], facute: {} };
  private ascultatori = new Set<() => void>();
  private ferestre: Partial<Record<SursaCerere, Window>> = {};
  private pornite = new Set<SursaCerere>();
  private nrJurnal = 0;
  private produse = new Map<number, string>();
  private baristi = new Map<number, string>();
  /** Intervalele în care tableta a fost fără internet: o comandă făcută atunci și sosită după a mers offline. */
  private faraInternet: { de: number; pana: number | null }[] = [];

  constructor(public server: ServerSim) {}

  citeste = () => this.stare;
  aboneaza = (f: () => void) => {
    this.ascultatori.add(f);
    return () => void this.ascultatori.delete(f);
  };
  private schimba(s: Partial<StareSimulare>) {
    this.stare = { ...this.stare, ...s };
    this.ascultatori.forEach((f) => f());
  }

  noteaza(actor: Actor, text: string, ton?: IntrareJurnal['ton']) {
    this.nrJurnal += 1;
    this.schimba({ jurnal: [{ id: this.nrJurnal, ora: ora(), actor, text, ton }, ...this.stare.jurnal].slice(0, 80) });
  }

  private bifeaza(pas: IdPas, nota = '') {
    if (this.stare.facute[pas] !== undefined && !nota) return;
    this.schimba({ facute: { ...this.stare.facute, [pas]: nota } });
  }

  async porneste() {
    const db = this.server.db;
    for (const p of await db.query<{ id: number; nume: string }>('SELECT id, nume FROM produse')) this.produse.set(p.id, p.nume);
    for (const u of await db.query<{ id: number; nume: string }>('SELECT id, nume FROM utilizatori')) this.baristi.set(u.id, u.nume);
    this.server.terminal.laEveniment((e) => this.noteaza('terminal', e.text, e.tip === 'plata_refuzata' ? 'atentie' : e.tip === 'plata_aprobata' ? 'bine' : undefined));
    this.noteaza('simulare', 'Rețeaua demo e pornită: depozit, Cafenea Centru (tableta din stânga) și Cafenea Botanica, cu 120 de zile de istoric.');
    void this.vanzariBotanica();
  }

  // ---- Legătura cu cadrele ----

  punte(): PunteSimulare {
    return {
      cerere: (c) => this.cerere(c),
      flux: (bilet, laMesaj) => this.server.flux(bilet, laMesaj),
      tableta: this.server.centru,
      tokenAdmin: this.server.tokenAdmin,
      primaPornire: (sursa) => !this.pornite.has(sursa) && !!this.pornite.add(sursa),
      pregatit: (sursa, fereastra) => {
        this.ferestre[sursa] = fereastra;
      },
    };
  }

  private async cerere(c: CerereCatreServer): Promise<RaspunsServer> {
    if (c.sursa === 'pos' && !this.stare.internet) {
      this.observaFaraInternet(c);
      return { fara_internet: true };
    }
    if (c.sursa === 'pos' && c.url === '/api/pos/terminal/plata' && c.corp) {
      this.noteaza('tableta', `Barista a ales „Card”: suma de ${formatLei(JSON.parse(c.corp).suma)} pleacă singură spre terminal, nu se tastează.`);
    }
    // O mică întârziere, ca pe o rețea reală.
    await pauza(30 + Math.random() * 70);
    const r = await this.server.ruter.trateaza(c.metoda, c.url, { authorization: c.autorizare ?? undefined, 'content-type': 'application/json' }, c.corp);
    try {
      await this.observa(c, r);
    } catch (e) {
      console.warn('ghid', e);
    }
    return r;
  }

  seteazaInternet(pornit: boolean) {
    if (pornit === this.stare.internet) return;
    const acum = Date.now();
    if (pornit) {
      const ultim = this.faraInternet[this.faraInternet.length - 1];
      if (ultim) ultim.pana = acum;
      this.noteaza('tableta', 'Wi-Fi pornit: tableta trimite singură tot ce a păstrat.', 'bine');
    } else {
      this.faraInternet.push({ de: acum, pana: null });
      this.noteaza('tableta', 'Wi-Fi oprit: tableta lucrează mai departe și păstrează operațiile în memoria ei.', 'atentie');
    }
    this.schimba({ internet: pornit });
    this.ferestre.pos?.dispatchEvent(new Event(pornit ? 'online' : 'offline'));
  }

  /** Utilizatorul s-a uitat în birou după o vânzare. */
  biroulLaVedere() {
    if (this.stare.facute.numerar !== undefined || this.stare.facute.card !== undefined) this.bifeaza('panou');
  }

  seteazaBotanica(pornit: boolean) {
    this.schimba({ botanica: pornit });
  }

  // ---- Ce se vede în jurnal și ce bifează ghidul ----

  private produseComanda(linii: LinieComanda[]) {
    return linii.map((l) => `${l.cantitate > 1 ? `${l.cantitate} × ` : ''}${this.produse.get(l.produs_id) ?? 'produs'}`).join(', ');
  }

  private descrieComanda(d: { linii: LinieComanda[]; metoda: 'numerar' | 'card' | 'casare'; total: number; motiv_casare?: MotivCasare | null }) {
    if (d.metoda === 'casare') return `Casare: ${this.produseComanda(d.linii)} (${d.motiv_casare ? ETICHETE_MOTIVE[d.motiv_casare] : 'fără motiv'}). Fără bani; ingredientele ies din stoc.`;
    return `Vânzare: ${this.produseComanda(d.linii)} (${d.metoda} ${formatLei(d.total)}). Stocul a scăzut după rețetă.`;
  }

  private faraInternetLa(la: string) {
    const t = Date.parse(la);
    return this.faraInternet.some((i) => t >= i.de && (i.pana === null || t <= i.pana));
  }

  private observaFaraInternet(c: CerereCatreServer) {
    if (c.url !== '/api/pos/sync' || !c.corp) return;
    const evenimente = (JSON.parse(c.corp).evenimente ?? []) as EvenimentPOS[];
    if (evenimente.length && evenimente.length !== this.stare.inTableta) {
      this.schimba({ inTableta: evenimente.length });
      this.noteaza('tableta', `Fără internet: ${evenimente.length === 1 ? 'o operație așteaptă' : `${evenimente.length} operații așteaptă`} în tabletă. Nimic nu se pierde.`, 'atentie');
    }
    if (evenimente.some((e) => e.tip === 'comanda')) this.bifeaza('offline');
  }

  private async observa(c: CerereCatreServer, r: RaspunsServer) {
    if (!('status' in r) || r.status >= 400) return;
    const cale = new URL(c.url, 'http://simulare.local').pathname;
    if (c.sursa === 'pos') await this.observaTableta(cale, c, r);
    else this.observaPanou(cale, c.metoda);
  }

  private async observaTableta(cale: string, c: CerereCatreServer, r: { corp: string }) {
    if (cale === '/api/pos/sync' && c.corp) {
      const evenimente = (JSON.parse(c.corp).evenimente ?? []) as EvenimentPOS[];
      if (!evenimente.length) return;
      const acceptate = new Set<string>(JSON.parse(r.corp).acceptate ?? []);
      const sositeTarziu = evenimente.filter((e) => this.faraInternetLa(e.la)).length;
      if (sositeTarziu) {
        this.noteaza('tableta', `Au ajuns pe server ${sositeTarziu === 1 ? 'o operație făcută' : `${sositeTarziu} operații făcute`} fără internet, cu ora lor reală.`, 'bine');
        if (evenimente.some((e) => e.tip === 'comanda' && this.faraInternetLa(e.la))) this.bifeaza('sincronizare');
      }
      this.schimba({ inTableta: 0 });
      for (const e of evenimente) {
        if (!acceptate.has(e.id)) continue;
        await this.observaEveniment(e);
      }
      this.noteaza('server', 'Stocul, banii și rapoartele s-au recalculat; panoul s-a actualizat singur.');
      return;
    }
    if (cale === '/api/pos/inventarieri' && c.metoda === 'POST') {
      this.noteaza('tableta', 'Inventariere începută: scripticul vine de pe server în timp real.');
    } else if (cale.endsWith('/finalizeaza')) {
      this.noteaza('tableta', 'Inventariere finalizată: diferențele au corectat stocul.', 'bine');
    }
  }

  private async observaEveniment(e: EvenimentPOS) {
    switch (e.tip) {
      case 'tura_deschisa':
        this.noteaza('tableta', `${this.baristi.get(e.date.utilizator_id) ?? 'Barista'} a deschis tura cu ${formatLei(e.date.fond_initial)} în sertar.`);
        this.bifeaza('tura');
        break;
      case 'comanda':
        this.noteaza('tableta', this.descrieComanda(e.date));
        this.bifeaza(e.date.metoda);
        break;
      case 'comanda_anulata':
        this.noteaza('tableta', `Comandă anulată (${e.date.motiv}); ${e.date.restituie_stoc ? 'produsele revin în stoc' : 'produsele rămân scăzute'}.`);
        break;
      case 'plata_marunta':
        this.noteaza('tableta', `Plată din sertar: ${formatLei(e.date.suma)} (${e.date.descriere}).`);
        break;
      case 'tura_inchisa': {
        const [t] = await this.server.db.query<Record<string, number | boolean | null>>('SELECT * FROM ture WHERE id = $1', [e.date.tura_id]);
        const dif = (d: string, s: string) => Math.round(((Number(t?.[d]) || 0) - (Number(t?.[s]) || 0)) * 100) / 100;
        const parti: string[] = [];
        const numerar = dif('declarat_numerar', 'scriptic_numerar');
        const card = dif('declarat_card', 'scriptic_card');
        const doze = dif('declarat_doze', 'scriptic_doze');
        const anulari = dif('declarat_anulari', 'scriptic_anulari');
        const casari = dif('declarat_casari', 'scriptic_casari');
        if (numerar) parti.push(`numerar ${numerar > 0 ? '+' : ''}${formatLei(numerar)}`);
        if (card) parti.push(`card ${card > 0 ? '+' : ''}${formatLei(card)}`);
        if (doze) parti.push(`doze ${doze > 0 ? '+' : ''}${doze}`);
        if (anulari) parti.push(`anulări ${anulari > 0 ? '+' : ''}${anulari}`);
        if (casari) parti.push(`casări ${casari > 0 ? '+' : ''}${casari}`);
        const nota = t?.are_discrepante ? `Diferențe: ${parti.join(', ')}. Panoul le-a semnalat la Ture.` : parti.length ? `Diferențe mici, în toleranță: ${parti.join(', ')}.` : 'Totul a ieșit exact.';
        this.noteaza('tableta', `Tura s-a închis. ${nota}`, t?.are_discrepante ? 'atentie' : 'bine');
        this.bifeaza('inchidere', nota);
        break;
      }
    }
  }

  private observaPanou(cale: string, metoda: string) {
    if (metoda === 'GET') {
      if (cale.startsWith('/api/rapoarte/')) this.bifeaza('rapoarte');
      return;
    }
    const ce: [RegExp, string][] = [
      [/^\/api\/receptii$/, 'Recepție de marfă înregistrată: stocul depozitului a crescut, costul mediu s-a recalculat.'],
      [/^\/api\/transferuri$/, 'Transfer intern: marfa a plecat dintr-o locație și a intrat în alta.'],
      [/^\/api\/(produse|modificatori|categorii)/, 'Rețetarul s-a schimbat: tabletele primesc catalogul nou la următoarea sincronizare.'],
      [/^\/api\/ture\/[^/]+\/verifica$/, 'Adminul a verificat tura și a lăsat o notă.'],
      [/^\/api\/bani\/miscari$/, 'Mișcare de bani înregistrată (depunere, ridicare sau plată).'],
      [/^\/api\/inventarieri/, 'Inventariere pornită din panou.'],
    ];
    const gasit = ce.find(([re]) => re.test(cale));
    if (gasit) this.noteaza('panou', gasit[1]);
  }

  // ---- A doua cafenea, care vinde singură ----

  private async vanzariBotanica() {
    const { token } = this.server.botanica;
    const trimite = (evenimente: EvenimentPOS[]) =>
      this.server.ruter.trateaza('POST', '/api/pos/sync', { authorization: `Bearer ${token}` }, JSON.stringify({ evenimente }));
    const catalog = JSON.parse((await this.server.ruter.trateaza('GET', '/api/pos/catalog', { authorization: `Bearer ${token}` }, null)).corp) as CatalogPOS;
    const barista = catalog.baristi.find((b) => b.nume === 'Ion Ceban') ?? catalog.baristi[0];
    const tura = crypto.randomUUID();
    await trimite([{ id: crypto.randomUUID(), tip: 'tura_deschisa', la: new Date().toISOString(), date: { tura_id: tura, utilizator_id: barista.id, fond_initial: 500 } }]);
    const produse = catalog.produse;
    for (let nr = 1; ; nr++) {
      await pauza(25_000 + Math.random() * 35_000);
      while (!this.stare.botanica) await pauza(2000);
      const linii: LinieComanda[] = Array.from({ length: Math.random() < 0.75 ? 1 : 2 }, () => {
        const p = produse[Math.floor(Math.random() * produse.length)];
        return { produs_id: p.id, cantitate: 1, pret_unitar: p.pret, modificatori: [] };
      });
      const total = totalComanda(linii);
      const metoda = Math.random() < 0.55 ? 'card' : 'numerar';
      const ev: EvenimentPOS = {
        id: crypto.randomUUID(),
        tip: 'comanda',
        la: new Date().toISOString(),
        date: {
          comanda_id: crypto.randomUUID(), tura_id: tura, utilizator_id: barista.id, nr, metoda, linii, total,
          primit: metoda === 'numerar' ? Math.ceil(total / 50) * 50 : null,
          card_autorizare: metoda === 'card' ? String(100000 + Math.floor(Math.random() * 900000)) : null,
        },
      };
      const r = await trimite([ev]);
      if (r.status === 200) this.noteaza('botanica', `Cafenea Botanica a vândut: ${this.produseComanda(linii)} (${metoda} ${formatLei(total)}).`);
    }
  }
}
