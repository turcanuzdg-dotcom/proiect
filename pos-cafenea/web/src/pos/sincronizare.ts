import type { RaspunsSync } from '@cafenea/shared';
import { cerereJson, EroareHttp } from '../comun/http';
import { evenimenteDinJurnal, numarInCoada, primeleDinCoada, scoateDinCoada } from './stocare';

export interface StareSync {
  online: boolean;
  inAsteptare: number;
  ultimaSincronizare: string | null;
  /** Evenimente pe care serverul nu le-a putut aplica (le vede adminul). */
  respinse: number;
  dezasociata: boolean;
  /** Cu cât e ceasul serverului înaintea tabletei (ms), aflat la ultima sincronizare; null = încă necunoscut. */
  decalajCeas: number | null;
}

export const STARE_SYNC_INITIALA = (): StareSync => ({
  online: navigator.onLine, inAsteptare: 0, ultimaSincronizare: null, respinse: 0, dezasociata: false, decalajCeas: null,
});

/** Peste acest decalaj față de server, tableta cere corectarea ceasului și nu deschide o tură nouă. */
export const DECALAJ_CEAS_MAXIM = 5 * 60_000;

/** Ceasul tabletei e greșit (momentul vânzărilor ar muta banii în alte ture). */
export const ceasGresit = (s: StareSync) => s.decalajCeas != null && Math.abs(s.decalajCeas) > DECALAJ_CEAS_MAXIM;

const LOT = 100;
// Fără vânzări, tableta verifică legătura și catalogul la 15 s; o vânzare pleacă imediat (acum()).
const PAUZA_NORMALA = 15_000;
const PAUZA_MAXIMA = 60_000;

/**
 * Golește coada locală spre server, în ordine, în loturi. Evenimentele se scot din coadă
 * doar după ce serverul a confirmat că le-a salvat; la o cădere de rețea nu se pierde nimic,
 * iar retrimiterea e inofensivă (serverul recunoaște evenimentele după UUID).
 */
export class Sincronizator {
  stare: StareSync = STARE_SYNC_INITIALA();
  private ascultatori = new Set<(s: StareSync) => void>();
  private ruleaza = false;
  private pauza = 1_000;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private oprit = false;
  /** Câte evenimente pleacă într-o cerere; scade dacă serverul refuză lotul ca prea mare (413). */
  private lot = LOT;

  constructor(
    private token: string,
    private versiuneCatalog: () => string | undefined,
    private laCatalogSchimbat: () => void,
  ) {}

  porneste() {
    window.addEventListener('online', this.acum);
    void this.actualizeazaNumar();
    this.programeaza(300);
  }

  opreste() {
    this.oprit = true;
    clearTimeout(this.timer);
    window.removeEventListener('online', this.acum);
  }

  aboneaza(f: (s: StareSync) => void) {
    this.ascultatori.add(f);
    f(this.stare);
    return () => void this.ascultatori.delete(f);
  }

  /** Apelat după fiecare vânzare: încearcă imediat, fără să aștepte pauza. */
  acum = () => {
    clearTimeout(this.timer);
    if (!this.ruleaza) void this.pas();
  };

  private seteaza(p: Partial<StareSync>) {
    this.stare = { ...this.stare, ...p };
    this.ascultatori.forEach((f) => f(this.stare));
  }

  private programeaza(ms: number) {
    if (this.oprit) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.pas(), ms);
  }

  async actualizeazaNumar() {
    this.seteaza({ inAsteptare: await numarInCoada() });
  }

  /** Trimite un lot și compară ceasul tabletei cu ora serverului (mijlocul cererii, ca întârzierea rețelei să nu conteze). */
  private async trimite(evenimente: unknown[], timeout: number): Promise<RaspunsSync> {
    const inainte = Date.now();
    const r = await cerereJson<RaspunsSync>('/api/pos/sync', { token: this.token, body: { evenimente }, timeout });
    const server = r.ora_server ? Date.parse(r.ora_server) : NaN;
    // Fără notificare separată: valoarea pleacă la abonați odată cu starea de după lot.
    if (Number.isFinite(server)) this.stare = { ...this.stare, decalajCeas: Math.round(server - (inainte + Date.now()) / 2) };
    return r;
  }

  /**
   * Trimite din nou jurnalul evenimentelor deja confirmate (ultimele 7 zile), în ordinea în care au fost
   * făcute, înaintea cozii obișnuite (care are doar evenimente mai noi). Serverul recunoaște după UUID ce
   * are deja; după o restaurare din copia de siguranță, refacerea zilei pierdute vine de aici.
   */
  async retrimiteJurnal(): Promise<{ trimise: number; respinse: number }> {
    while (this.ruleaza) await new Promise((r) => setTimeout(r, 200));
    this.ruleaza = true;
    clearTimeout(this.timer);
    let trimise = 0;
    let respinse = 0;
    try {
      let dupa = 0;
      for (;;) {
        const lot = await evenimenteDinJurnal(LOT, dupa);
        if (!lot.length) break;
        const r = await this.trimite(lot.map((x) => x.ev), 30_000);
        trimise += lot.length;
        respinse += r.cu_eroare.length;
        dupa = lot[lot.length - 1].secv;
      }
    } finally {
      this.ruleaza = false;
      this.programeaza(300);
    }
    return { trimise, respinse };
  }

  private async pas() {
    if (this.ruleaza || this.oprit) return;
    this.ruleaza = true;
    try {
      let lot = await primeleDinCoada(this.lot);
      if (!lot.length) {
        // Coada e goală: un sync gol verifică legătura, tokenul și versiunea catalogului.
        const r = await this.trimite([], 8_000);
        if (r.catalog_versiune !== this.versiuneCatalog()) this.laCatalogSchimbat();
      }
      while (lot.length) {
        let r: RaspunsSync;
        try {
          r = await this.trimite(lot.map((x) => x.ev), 30_000);
        } catch (e) {
          // Lot prea mare pentru limita serverului: se trimite pe bucăți mai mici, ca coada să nu se
          // blocheze (un singur eveniment e oricum mult sub limită).
          if (e instanceof EroareHttp && e.status === 413 && lot.length > 1) {
            this.lot = Math.max(1, Math.floor(lot.length / 2));
            lot = lot.slice(0, this.lot);
            continue;
          }
          throw e;
        }
        const confirmate = new Set([...r.acceptate, ...r.cu_eroare.map((e) => e.id)]);
        await scoateDinCoada(lot.filter((x) => confirmate.has(x.ev.id)).map((x) => x.secv));
        this.seteaza({
          respinse: this.stare.respinse + r.cu_eroare.length,
          ultimaSincronizare: new Date().toISOString(),
          inAsteptare: await numarInCoada(),
        });
        if (r.catalog_versiune !== this.versiuneCatalog()) this.laCatalogSchimbat();
        if (confirmate.size === 0) break;
        lot = await primeleDinCoada(this.lot);
      }
      this.pauza = PAUZA_NORMALA;
      this.lot = LOT;
      this.seteaza({ online: true, dezasociata: false, ultimaSincronizare: this.stare.ultimaSincronizare ?? new Date().toISOString() });
    } catch (e) {
      const dezasociata = e instanceof EroareHttp && e.status === 401;
      this.pauza = Math.min(this.pauza * 2, PAUZA_MAXIMA);
      this.seteaza({ online: false, dezasociata });
    } finally {
      this.ruleaza = false;
      await this.actualizeazaNumar();
      this.programeaza(this.stare.online ? PAUZA_NORMALA : this.pauza);
    }
  }
}
