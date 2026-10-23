/** O notificare live de pe server (vezi server/src/magistrala.ts). */
export interface Notificare {
  tip: 'stoc' | 'comanda' | 'tura' | 'bani' | 'catalog' | 'sync_eroare';
  locatie_id?: number | null;
}

/** Cum își reîncarcă o pagină datele la notificările live. */
export interface OptiuniLive {
  /** false: nicio reîncărcare la notificări (rapoartele), doar la cerere. Implicit true. */
  live?: boolean;
  /** Cel mult o reîncărcare la atâtea ms (implicit 10 s). */
  minimMs?: number;
  /**
   * Pagina e filtrată pe o locație: notificările altor locații nu o privesc. null/lipsă = toate.
   * Notificările fără locație (de ex. catalogul) se aplică oricum.
   */
  locatie?: number | null;
}

export const MINIM_IMPLICIT_MS = 10_000;
/** Notificările venite împreună (o vânzare trimite comanda, stocul și banii) dau o singură reîncărcare. */
export const GRUPARE_MS = 500;

export function priveste(n: Notificare, opt: OptiuniLive): boolean {
  if (opt.live === false) return false;
  return opt.locatie == null || n.locatie_id == null || n.locatie_id === opt.locatie;
}

export interface Mediu {
  acum: () => number;
  ascuns: () => boolean;
  programeaza: (fn: () => void, ms: number) => unknown;
  anuleaza: (t: unknown) => void;
}

const mediuBrowser: Mediu = {
  acum: () => Date.now(),
  ascuns: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  programeaza: (fn, ms) => window.setTimeout(fn, ms),
  anuleaza: (t) => window.clearTimeout(t as number),
};

/**
 * Limitează reîncărcările unei pagini declanșate de notificări:
 *  - prima notificare după o pauză reîncarcă după GRUPARE_MS (cele venite odată se adună);
 *  - apoi cel mult o reîncărcare la `minimMs`, iar ultima notificare dintr-un șir nu se pierde
 *    (reîncărcarea de la capătul intervalului o prinde);
 *  - cât fila e ascunsă nu se reîncarcă nimic; la revenire, o singură reîncărcare dacă a venit ceva;
 *  - cât o încărcare e în curs nu pornește alta: se reîncarcă o dată după ce se termină.
 * Fiecare încărcare a paginii (și cea manuală, și cea la schimbarea filtrelor) se raportează prin
 * `incarcat()`, ca intervalul să curgă de la ultima încărcare reală.
 */
export class Limitator {
  private ultima = Number.NEGATIVE_INFINITY;
  private timer: unknown = null;
  private laRevenire = false;
  private dupaIncarcare = false;
  private inCurs = 0;

  constructor(
    private readonly reincarca: () => void,
    private readonly minimMs: number = MINIM_IMPLICIT_MS,
    private readonly mediu: Mediu = mediuBrowser,
  ) {}

  /** A venit o notificare care privește pagina. */
  semnal(): void {
    if (this.mediu.ascuns()) {
      this.laRevenire = true;
      return;
    }
    if (this.timer != null) return; // o reîncărcare e deja programată și o va prinde
    const intarziere = Math.max(GRUPARE_MS, this.ultima + this.minimMs - this.mediu.acum());
    this.timer = this.mediu.programeaza(() => this.declanseaza(), intarziere);
  }

  /** Fila a redevenit vizibilă. */
  vizibil(): void {
    if (!this.laRevenire) return;
    this.laRevenire = false;
    this.semnal();
  }

  /** A pornit o încărcare (oricare). */
  incepe(): void {
    this.inCurs++;
    this.ultima = this.mediu.acum();
  }

  /** S-a terminat o încărcare (cu sau fără succes). */
  incarcat(): void {
    this.inCurs = Math.max(0, this.inCurs - 1);
    this.ultima = this.mediu.acum();
    if (this.dupaIncarcare) {
      this.dupaIncarcare = false;
      this.semnal();
    }
  }

  opreste(): void {
    if (this.timer != null) this.mediu.anuleaza(this.timer);
    this.timer = null;
  }

  private declanseaza(): void {
    this.timer = null;
    if (this.mediu.ascuns()) {
      this.laRevenire = true;
      return;
    }
    if (this.inCurs > 0) {
      this.dupaIncarcare = true;
      return;
    }
    this.reincarca();
  }
}
