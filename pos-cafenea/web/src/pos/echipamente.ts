import { cerereJson } from '../comun/http';
import type { ConfigEchipamente } from './stocare';

// Legătura cu terminalul de plată și imprimanta fiscală. Browserul tabletei nu poate vorbi
// direct cu ele (port serial/USB/TCP), așa că trece printr-o „punte” locală (directorul punte/)
// care implementează protocolul concret al băncii și al casei de marcat. Până știm modelele,
// se folosește simulatorul.

export interface RezultatCard {
  aprobat: boolean;
  autorizare?: string;
  mesaj?: string;
}

export interface RezultatTiparire {
  ok: boolean;
  mesaj?: string;
}

export interface BonFiscal {
  referinta: string;
  nr: number;
  linii: { nume: string; cantitate: number; pret_unitar: number; total: number }[];
  total: number;
  metoda: 'numerar' | 'card';
  primit?: number | null;
  rest?: number | null;
}

export interface Echipamente {
  readonly descriere: string;
  /** Trimite suma la terminal și așteaptă clientul să apropie cardul. */
  platesteCard(suma: number, referinta: string): Promise<RezultatCard>;
  returCard(suma: number, autorizare: string | null, referinta: string): Promise<RezultatCard>;
  tiparesteBon(bon: BonFiscal): Promise<RezultatTiparire>;
  tiparesteRetur(bon: BonFiscal): Promise<RezultatTiparire>;
  /** Raportul Z fiscal, la închiderea zilei. */
  raportZ(): Promise<RezultatTiparire>;
  verifica(): Promise<{ terminal: string; imprimanta: string }>;
}

const asteapta = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Simulator implements Echipamente {
  readonly descriere = 'Simulator (fără echipamente reale)';
  constructor(private refuza = false) {}

  async platesteCard(): Promise<RezultatCard> {
    await asteapta(1200);
    if (this.refuza) return { aprobat: false, mesaj: 'Tranzacție refuzată (simulare)' };
    return { aprobat: true, autorizare: String(Math.floor(100000 + Math.random() * 900000)) };
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
  constructor(private url: string) {
    this.descriere = `Punte locală ${url}`;
  }
  private cere<T>(cale: string, body?: unknown, timeout = 10_000) {
    return cerereJson<T>(`${this.url.replace(/\/$/, '')}${cale}`, { body, timeout });
  }
  // Plata așteaptă clientul la terminal; terminalele anulează singure după ~60 s.
  platesteCard(suma: number, referinta: string) {
    return this.cere<RezultatCard>('/terminal/plata', { suma_bani: Math.round(suma * 100), referinta }, 120_000);
  }
  returCard(suma: number, autorizare: string | null, referinta: string) {
    return this.cere<RezultatCard>('/terminal/retur', { suma_bani: Math.round(suma * 100), autorizare, referinta }, 120_000);
  }
  tiparesteBon(bon: BonFiscal) {
    return this.cere<RezultatTiparire>('/imprimanta/bon', bon, 30_000);
  }
  tiparesteRetur(bon: BonFiscal) {
    return this.cere<RezultatTiparire>('/imprimanta/retur', bon, 30_000);
  }
  raportZ() {
    return this.cere<RezultatTiparire>('/imprimanta/raport-z', {}, 60_000);
  }
  verifica() {
    return this.cere<{ terminal: string; imprimanta: string }>('/stare');
  }
}

export function creeazaEchipamente(c: ConfigEchipamente | undefined): Echipamente {
  if (c?.tip === 'punte' && c.url) return new Punte(c.url);
  return new Simulator(c?.simuleazaRefuz);
}
