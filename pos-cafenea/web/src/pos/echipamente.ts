import { cerereJson } from '../comun/http';
import type { ConfigEchipamente } from './stocare';

// Legătura cu terminalul de plată și imprimanta fiscală. Browserul tabletei nu poate vorbi
// direct cu ele (port serial/USB/TCP), așa că trece printr-o „punte” locală (directorul punte/)
// care implementează protocolul concret al băncii și al casei de marcat. Până știm modelele,
// se folosește simulatorul.

export interface RezultatCard {
  aprobat: boolean;
  autorizare?: string;
  /** Referințele băncii, necesare la restituire. */
  rrn?: string;
  operation_id?: string;
  mesaj?: string;
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
  constructor(private token: () => string | undefined) {}
  private cere<T>(cale: string, body?: unknown, timeout = 20_000) {
    return cerereJson<T>(`/api/pos/terminal${cale}`, { token: this.token(), body, timeout, method: body === undefined ? 'GET' : 'POST' });
  }
  async platesteCard(suma: number, referinta: string): Promise<RezultatCard> {
    // Clientul are până la 5 minute la terminal; serverul verifică „ultima tranzacție” dacă răspunsul se pierde.
    try {
      return await this.cere<RezultatCard>('/plata', { suma, referinta }, 6 * 60_000);
    } catch (e) {
      return { aprobat: false, mesaj: (e as Error).message };
    }
  }
  async returCard(suma: number, plata: ReferintePlata, referinta: string): Promise<RezultatCard> {
    try {
      return await this.cere<RezultatCard>('/retur', { suma, referinta, rrn: plata.rrn ?? null, operation_id: plata.operation_id ?? null }, 120_000);
    } catch (e) {
      return { aprobat: false, mesaj: (e as Error).message };
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

export function creeazaEchipamente(c: ConfigEchipamente | undefined, token: () => string | undefined = () => undefined): Echipamente {
  if (c?.tip === 'server') return new PrinServer(token);
  if (c?.tip === 'punte' && c.url) return new Punte(c.url, c.secret ?? '');
  return new Simulator(c?.simuleazaRefuz);
}
