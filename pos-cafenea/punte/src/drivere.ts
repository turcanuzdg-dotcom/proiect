// Driverele echipamentelor. Fiecare bancă din Moldova are propriul protocol ECR pentru
// terminale (Ingenico, Verifone, PAX), iar casele de marcat fiscale (Datecs, Tremol, Daisy)
// au protocolul producătorului. Când știm modelele, se adaugă aici câte o clasă care
// implementează interfața și se alege cu variabilele TERMINAL / IMPRIMANTA.

export interface RezultatCard {
  aprobat: boolean;
  autorizare?: string;
  mesaj?: string;
}

export interface LinieBon {
  nume: string;
  cantitate: number;
  pret_unitar: number;
  total: number;
}

export interface Bon {
  referinta: string;
  nr: number;
  linii: LinieBon[];
  total: number;
  metoda: 'numerar' | 'card';
  primit?: number | null;
}

export interface TerminalPlata {
  readonly nume: string;
  /** Suma în bani (1 leu = 100 bani), cum o cer protocoalele ECR. */
  plata(sumaBani: number, referinta: string): Promise<RezultatCard>;
  retur(sumaBani: number, autorizare: string | null, referinta: string): Promise<RezultatCard>;
}

export interface ImprimantaFiscala {
  readonly nume: string;
  bon(b: Bon): Promise<void>;
  retur(b: Bon): Promise<void>;
  /** Copie nefiscală a unui bon deja emis (clientul a pierdut bonul); nu e un bon fiscal nou. */
  duplicat(b: Bon): Promise<void>;
  raportZ(): Promise<void>;
}

const asteapta = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class TerminalSimulat implements TerminalPlata {
  readonly nume = 'terminal simulat';
  async plata(sumaBani: number): Promise<RezultatCard> {
    await asteapta(800);
    if (sumaBani <= 0) return { aprobat: false, mesaj: 'Sumă invalidă' };
    return { aprobat: true, autorizare: String(100000 + Math.floor(Math.random() * 900000)) };
  }
  async retur(): Promise<RezultatCard> {
    await asteapta(500);
    return { aprobat: true, autorizare: String(100000 + Math.floor(Math.random() * 900000)) };
  }
}

export class ImprimantaSimulata implements ImprimantaFiscala {
  readonly nume = 'imprimantă simulată';
  readonly tiparite: { tip: string; bon?: Bon }[] = [];
  async bon(b: Bon) {
    this.tiparite.push({ tip: 'bon', bon: b });
    console.log(`[imprimantă] BON #${b.nr} ${b.total.toFixed(2)} lei (${b.metoda})`);
  }
  async retur(b: Bon) {
    this.tiparite.push({ tip: 'retur', bon: b });
    console.log(`[imprimantă] RETUR #${b.nr} ${b.total.toFixed(2)} lei`);
  }
  async duplicat(b: Bon) {
    this.tiparite.push({ tip: 'duplicat', bon: b });
    console.log(`[imprimantă] DUPLICAT (nefiscal) #${b.nr}`);
  }
  async raportZ() {
    this.tiparite.push({ tip: 'raport_z' });
    console.log('[imprimantă] RAPORT Z');
  }
}

export function alegeTerminal(nume = 'simulator'): TerminalPlata {
  switch (nume) {
    case 'simulator':
      return new TerminalSimulat();
    default:
      throw new Error(`Terminal necunoscut: ${nume}. Driverul pentru acest model încă nu a fost scris.`);
  }
}

export function alegeImprimanta(nume = 'simulator'): ImprimantaFiscala {
  switch (nume) {
    case 'simulator':
      return new ImprimantaSimulata();
    default:
      throw new Error(`Imprimantă necunoscută: ${nume}. Driverul pentru acest model încă nu a fost scris.`);
  }
}
