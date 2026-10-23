/**
 * Reîmprospătarea periodică a unui ecran care citește de la server (raportul de inventariere deschis).
 * Cererile pornite prin `urmareste` (citire, salvare, finalizare) o opresc cât sunt în curs, deci nu
 * pleacă niciodată două cereri deodată și un răspuns vechi nu acoperă unul mai nou. Nu se cere nimic
 * cât ecranul e ascuns (tableta în repaus, altă aplicație în față).
 */
export class Reimprospatare {
  private inCurs = 0;

  constructor(
    /** Cererea periodică; trebuie să treacă și ea prin `urmareste`. */
    private readonly ruleaza: () => void,
    /** Dacă mai are rost reîmprospătarea (de ex. raportul e încă deschis). */
    private readonly activ: () => boolean,
    private readonly ascuns: () => boolean = () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  ) {}

  /** Ține socoteala cererilor în curs: cât timp una nu s-a terminat, reîmprospătarea așteaptă. */
  async urmareste<T>(p: Promise<T>): Promise<T> {
    this.inCurs++;
    try {
      return await p;
    } finally {
      this.inCurs--;
    }
  }

  /** O bătaie a ceasului: cere din nou doar dacă nimic nu e în curs și ecranul se vede. */
  bataie() {
    if (!this.activ() || this.inCurs || this.ascuns()) return;
    this.ruleaza();
  }

  /** Pornește ceasul; întoarce funcția care îl oprește. */
  porneste(intervalMs: number): () => void {
    const t = setInterval(() => this.bataie(), intervalMs);
    return () => clearInterval(t);
  }
}
