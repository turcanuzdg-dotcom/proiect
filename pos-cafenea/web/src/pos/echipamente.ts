import { COD_TERMINAL, type CatalogPOS, type CodTerminal } from '@cafenea/shared';
import { cerereJson, EroareHttp } from '../comun/http';
import type { ConfigEchipamente } from './stocare';

// Legătura cu terminalul de plată și imprimanta fiscală. În producție: terminalul bancar în regim
// fiscal legat în panou (POSLink, prin server) sau, la pilot, un terminal separat fără legătură, pe
// care barista introduce suma de mână. Simulatorul și puntea locală (directorul punte/) aprobă orice
// plată, deci apar doar în dezvoltare sau cu modul demonstrație pornit din panou.

export interface RezultatCard {
  aprobat: boolean;
  autorizare?: string;
  /** Referințele băncii, necesare la restituire. */
  rrn?: string;
  operation_id?: string;
  mesaj?: string;
  /** Rezultatul nu se poate confirma: nu e plată, dar nici refuz; reîncercarea verifică din nou. */
  nesigur?: boolean;
  /** Motivul unui rezultat pe care o reîncercare nu-l schimbă (COD_TERMINAL), primit de la server. */
  cod?: CodTerminal;
  /** La `plata_deja_aprobata` / `plata_nelamurita`: suma deja aprobată, respectiv cea încă nelămurită. */
  suma_anterioara?: number;
  /** La `retur_alt_terminal`: terminalul care a încasat plata. */
  terminal?: string;
}

/** Ce urmează după un retur pe card: anularea se înregistrează, se face din meniul terminalului, se verifică… */
export type UrmareRetur = 'inregistreaza' | 'din_meniu' | 'nesigur' | 'refuzat';

export function urmareRetur(r: RezultatCard): UrmareRetur {
  if (r.aprobat) return 'inregistreaza';
  if (r.cod === COD_TERMINAL.returDinMeniu || r.cod === COD_TERMINAL.returAltTerminal) return 'din_meniu';
  return r.nesigur ? 'nesigur' : 'refuzat';
}

/**
 * Un răspuns de eroare de la server, la plata prin server. Doar ce se poate lămuri printr-o reîncercare
 * (fără răspuns, 5xx, „plata e în curs”) e nesigur; o configurare lipsă sau o plată deja aprobată pentru
 * altă sumă nu se schimbă apăsând „Verifică din nou”.
 */
export function rezultatDinEroarePlata(e: unknown): RezultatCard {
  const mesaj = (e as Error).message;
  if (!(e instanceof EroareHttp)) return { aprobat: false, mesaj, nesigur: true };
  const suma = (k: string) => (typeof e.date?.[k] === 'number' ? (e.date[k] as number) : undefined);
  switch (e.cod) {
    case COD_TERMINAL.configurare:
      return { aprobat: false, mesaj, cod: e.cod };
    case COD_TERMINAL.plataDejaAprobata:
      return { aprobat: false, mesaj, cod: e.cod, suma_anterioara: suma('suma_aprobata') };
    case COD_TERMINAL.plataNelamurita:
      return { aprobat: false, mesaj, cod: e.cod, suma_anterioara: suma('suma_nelamurita') };
    case COD_TERMINAL.operatieInCurs:
      return { aprobat: false, mesaj, nesigur: true };
  }
  const definitiv = e.status >= 400 && e.status < 500 && e.status !== 409;
  return { aprobat: false, mesaj, ...(definitiv ? {} : { nesigur: true }) };
}

export interface ReferintePlata {
  autorizare?: string | null;
  rrn?: string | null;
  operation_id?: string | null;
}

export interface RezultatTiparire {
  ok: boolean;
  mesaj?: string;
}

export interface BonFiscal {
  referinta: string;
  nr: number;
  linii: { produs_id?: number | null; nume: string; cantitate: number; pret_unitar: number; total: number }[];
  total: number;
  metoda: 'numerar' | 'card';
  primit?: number | null;
  rest?: number | null;
  card?: ReferintePlata | null;
}

export interface Echipamente {
  readonly descriere: string;
  /** Poate tipări o copie nefiscală a unui bon emis. */
  readonly poateDuplica: boolean;
  /**
   * Terminal separat, fără legătură: suma se introduce de mână pe terminal, barista confirmă pe tabletă
   * dacă plata a trecut, iar bonul fiscal, returul și raportul Z se fac din meniul terminalului.
   */
  readonly manual: boolean;
  /** Trimite suma la terminal și așteaptă clientul să apropie cardul. */
  platesteCard(suma: number, referinta: string): Promise<RezultatCard>;
  returCard(suma: number, plata: ReferintePlata, referinta: string): Promise<RezultatCard>;
  tiparesteBon(bon: BonFiscal): Promise<RezultatTiparire>;
  tiparesteRetur(bon: BonFiscal): Promise<RezultatTiparire>;
  /** Copie nefiscală a unui bon deja emis. */
  tiparesteDuplicat(bon: BonFiscal): Promise<RezultatTiparire>;
  /** Raportul Z fiscal, la închiderea zilei. */
  raportZ(): Promise<RezultatTiparire>;
  verifica(): Promise<{ terminal: string; imprimanta: string }>;
}

const asteapta = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Simulator implements Echipamente {
  readonly descriere = 'Simulator (fără echipamente reale)';
  readonly poateDuplica = true;
  readonly manual = false;
  constructor(private refuza = false) {}

  async platesteCard(): Promise<RezultatCard> {
    await asteapta(1200);
    if (this.refuza) return { aprobat: false, mesaj: 'Tranzacție refuzată (simulare)' };
    return { aprobat: true, autorizare: String(Math.floor(100000 + Math.random() * 900000)), rrn: String(Date.now()).slice(-12) };
  }
  async returCard(): Promise<RezultatCard> {
    await asteapta(800);
    return { aprobat: true, autorizare: String(Math.floor(100000 + Math.random() * 900000)) };
  }
  async tiparesteBon(bon: BonFiscal): Promise<RezultatTiparire> {
    console.info('[simulator] bon fiscal', bon);
    return { ok: true };
  }
  async tiparesteRetur(bon: BonFiscal): Promise<RezultatTiparire> {
    console.info('[simulator] bon de retur', bon);
    return { ok: true };
  }
  async tiparesteDuplicat(bon: BonFiscal): Promise<RezultatTiparire> {
    console.info('[simulator] duplicat', bon);
    return { ok: true };
  }
  async raportZ(): Promise<RezultatTiparire> {
    return { ok: true };
  }
  async verifica() {
    return { terminal: 'simulat', imprimanta: 'simulată' };
  }
}

/** Puntea locală: un mic serviciu HTTP pe tabletă sau pe un calculator din cafenea. */
class Punte implements Echipamente {
  readonly descriere: string;
  readonly poateDuplica = true;
  readonly manual = false;
  constructor(
    private url: string,
    private secret: string,
  ) {
    this.descriere = `Punte locală ${url}`;
  }
  private cere<T>(cale: string, body?: unknown, timeout = 10_000) {
    return cerereJson<T>(`${this.url.replace(/\/$/, '')}${cale}`, { body, timeout, method: body === undefined ? 'GET' : 'POST', headers: { 'X-Punte-Token': this.secret } });
  }
  // Plata așteaptă clientul la terminal; terminalele anulează singure după ~60 s.
  platesteCard(suma: number, referinta: string) {
    return this.cere<RezultatCard>('/terminal/plata', { suma_bani: Math.round(suma * 100), referinta }, 120_000);
  }
  returCard(suma: number, plata: ReferintePlata, referinta: string) {
    return this.cere<RezultatCard>('/terminal/retur', { suma_bani: Math.round(suma * 100), autorizare: plata.autorizare ?? null, rrn: plata.rrn ?? null, operation_id: plata.operation_id ?? null, referinta }, 120_000);
  }
  tiparesteBon(bon: BonFiscal) {
    return this.cere<RezultatTiparire>('/imprimanta/bon', bon, 30_000);
  }
  tiparesteRetur(bon: BonFiscal) {
    return this.cere<RezultatTiparire>('/imprimanta/retur', bon, 30_000);
  }
  tiparesteDuplicat(bon: BonFiscal) {
    return this.cere<RezultatTiparire>('/imprimanta/duplicat', bon, 30_000);
  }
  raportZ() {
    return this.cere<RezultatTiparire>('/imprimanta/raport-z', {}, 60_000);
  }
  verifica() {
    return this.cere<{ terminal: string; imprimanta: string }>('/stare');
  }
}

/**
 * Terminalul bancar în regim fiscal (de ex. PAX A930 cu IS Fiscal), prin serverul nostru și POSLink:
 * plata cu cardul, bonul fiscal și raportul Z se fac pe același aparat. Cheia API stă pe server.
 */
class PrinServer implements Echipamente {
  readonly descriere = 'Terminal fiscal prin server (POSLink)';
  // POSLink nu are comandă de copie; copia se face din meniul casei fiscale de pe terminal.
  readonly poateDuplica = false;
  readonly manual = false;
  constructor(private token: () => string | undefined) {}
  private cere<T>(cale: string, body?: unknown, timeout = 20_000) {
    return cerereJson<T>(`/api/pos/terminal${cale}`, { token: this.token(), body, timeout, method: body === undefined ? 'GET' : 'POST' });
  }
  async platesteCard(suma: number, referinta: string): Promise<RezultatCard> {
    // Clientul are până la 5 minute la terminal; dacă răspunsul se pierde, serverul mai verifică „ultima
    // tranzacție” și închide documentul: în cel mai rău caz cam 7 minute. Tableta așteaptă mai mult decât
    // serverul, ca să nu renunțe în timp ce plata încă se poate aproba.
    try {
      return await this.cere<RezultatCard>('/plata', { suma, referinta }, TIMP_PLATA_SERVER);
    } catch (e) {
      // Fără răspuns de la server nu știm ce s-a întâmplat pe terminal: reîncercarea cu aceeași referință
      // se alătură plății în curs sau întoarce rezultatul înregistrat, fără să încaseze a doua oară.
      return rezultatDinEroarePlata(e);
    }
  }
  /** Serverul ia RRN-ul și suma din plata înregistrată a comenzii; tableta trimite doar comanda. */
  async returCard(suma: number, _plata: ReferintePlata, referinta: string): Promise<RezultatCard> {
    try {
      return await this.cere<RezultatCard>('/retur', { referinta, suma }, 150_000);
    } catch (e) {
      // Fără plată înregistrată prin server (sau încasată pe alt terminal): returul se face din meniul terminalului.
      if (e instanceof EroareHttp && (e.cod === COD_TERMINAL.returDinMeniu || e.cod === COD_TERMINAL.returAltTerminal)) {
        return { aprobat: false, mesaj: e.message, cod: e.cod, terminal: typeof e.date?.terminal === 'string' ? e.date.terminal : undefined };
      }
      // O configurare lipsă (POSLink neconfigurat, tableta fără terminal): nimic n-a ajuns la terminal, deci
      // e refuz, nu retur nesigur. Un retur în curs pentru aceeași comandă (de pe altă tabletă) e nesigur:
      // barista verifică din nou, nu face returul de mână cât cel trimis de server încă rulează.
      if (e instanceof EroareHttp && e.cod === COD_TERMINAL.configurare) return { aprobat: false, mesaj: e.message, cod: e.cod };
      if (e instanceof EroareHttp && e.cod === COD_TERMINAL.operatieInCurs) return { aprobat: false, mesaj: e.message, nesigur: true };
      return { aprobat: false, mesaj: (e as Error).message, ...(e instanceof EroareHttp && e.status !== 0 && e.status < 500 ? {} : { nesigur: true }) };
    }
  }
  async tiparesteBon(bon: BonFiscal): Promise<RezultatTiparire> {
    try {
      const r = await this.cere<{ ok: boolean; mesaj?: string }>(
        '/bon',
        {
          comanda_id: bon.referinta,
          numar: String(bon.nr),
          linii: bon.linii.map((l) => ({ produs_id: l.produs_id ?? null, nume: l.nume, cantitate: l.cantitate, pret_unitar: l.pret_unitar })),
          metoda: bon.metoda,
          total: bon.total,
          primit: bon.primit ?? null,
          card: bon.metoda === 'card' ? { rrn: bon.card?.rrn ?? null, autorizare: bon.card?.autorizare ?? null } : null,
        },
        120_000,
      );
      return { ok: r.ok, mesaj: r.mesaj };
    } catch (e) {
      return { ok: false, mesaj: (e as Error).message };
    }
  }
  async tiparesteRetur(): Promise<RezultatTiparire> {
    return { ok: false, mesaj: 'bonul de retur se emite din meniul casei fiscale de pe terminal' };
  }
  async tiparesteDuplicat(): Promise<RezultatTiparire> {
    return { ok: false, mesaj: 'terminalul nu tipărește copii prin POSLink; copia se face din meniul casei fiscale' };
  }
  async raportZ(): Promise<RezultatTiparire> {
    try {
      const r = await this.cere<{ ok: boolean; mesaj?: string }>('/raport-z', {}, 180_000);
      return { ok: r.ok, mesaj: r.mesaj };
    } catch (e) {
      return { ok: false, mesaj: (e as Error).message };
    }
  }
  async verifica() {
    const r = await this.cere<{ terminal_device_id: string; stare: Record<string, unknown> }>('/stare');
    const s = r.stare;
    const parti = [s.online === true ? 'online' : s.online === false ? 'offline' : null, s.battery != null ? `baterie ${s.battery}%` : null, s.paper != null ? `hârtie ${s.paper}` : null, s.bank ? String(s.bank) : null].filter(Boolean);
    return { terminal: `${r.terminal_device_id} · ${parti.join(' · ') || 'stare necunoscută'}`, imprimanta: 'pe terminal (regim fiscal)' };
  }
}

/** Cât așteaptă tableta răspunsul serverului la o plată (ms): peste cele ~7 minute ale serverului. */
export const TIMP_PLATA_SERVER = 7.5 * 60_000;

/**
 * Terminal separat, fără legătură cu tableta (pilotul fără POSLink): barista introduce suma pe terminal
 * și confirmă pe tabletă dacă plata a trecut. Bonul fiscal, returul și raportul Z se fac pe terminal.
 */
class TerminalSeparat implements Echipamente {
  readonly descriere = 'Terminal separat (fără legătură)';
  readonly poateDuplica = false;
  readonly manual = true;
  async platesteCard(): Promise<RezultatCard> {
    return { aprobat: false, mesaj: 'introduceți suma pe terminal' };
  }
  async returCard(): Promise<RezultatCard> {
    return { aprobat: false, mesaj: 'returul se face din meniul terminalului' };
  }
  async tiparesteBon(): Promise<RezultatTiparire> {
    return { ok: false, mesaj: 'bonul fiscal se emite pe terminal' };
  }
  async tiparesteRetur(): Promise<RezultatTiparire> {
    return { ok: false, mesaj: 'bonul de retur se emite pe terminal' };
  }
  async tiparesteDuplicat(): Promise<RezultatTiparire> {
    return { ok: false, mesaj: 'copia bonului se face pe terminal' };
  }
  async raportZ(): Promise<RezultatTiparire> {
    return { ok: false, mesaj: 'raportul Z se tipărește din meniul terminalului' };
  }
  async verifica() {
    return { terminal: 'separat, fără legătură cu tableta', imprimanta: 'pe terminal' };
  }
}

/** Simulatorul și puntea locală se pot alege doar în dezvoltare sau cu modul demonstrație din panou. */
export const demonstratiePermisa = (catalog: Pick<CatalogPOS, 'mod_demonstratie'> | undefined, dezvoltare = import.meta.env.DEV) =>
  dezvoltare || !!catalog?.mod_demonstratie;

/**
 * Echipamentele folosite de fapt: terminalul legat în panou are întâietate față de orice alegere salvată
 * pe tabletă; Simulatorul și puntea doar cu demonstrația permisă; altfel terminalul separat (manual).
 */
export function alegeEchipamente(
  catalog: Pick<CatalogPOS, 'terminal_prin_server' | 'mod_demonstratie'> | undefined,
  salvat: ConfigEchipamente | undefined,
  dezvoltare = import.meta.env.DEV,
): ConfigEchipamente {
  if (catalog?.terminal_prin_server) return { tip: 'server', url: '' };
  if (salvat && (salvat.tip === 'simulator' || salvat.tip === 'punte') && demonstratiePermisa(catalog, dezvoltare)) return salvat;
  return { tip: 'manual', url: '' };
}

export function creeazaEchipamente(c: ConfigEchipamente | undefined, token: () => string | undefined = () => undefined): Echipamente {
  if (c?.tip === 'server') return new PrinServer(token);
  if (c?.tip === 'punte' && c.url) return new Punte(c.url, c.secret ?? '');
  if (c?.tip === 'simulator') return new Simulator(c.simuleazaRefuz);
  return new TerminalSeparat();
}
