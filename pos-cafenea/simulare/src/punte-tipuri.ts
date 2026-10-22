// Legătura dintre aplicațiile reale (tableta și panoul, fiecare în cadrul ei) și serverul
// care rulează în pagina simulării. Pagina o pune în window.__sim; cadrele o folosesc prin window.parent.

export type SursaCerere = 'pos' | 'admin';

export interface CerereCatreServer {
  sursa: SursaCerere;
  metoda: string;
  url: string;
  autorizare: string | null;
  corp: string | null;
}

export type RaspunsServer = { status: number; corp: string } | { fara_internet: true };

export interface PunteSimulare {
  cerere(c: CerereCatreServer): Promise<RaspunsServer>;
  flux(bilet: string, laMesaj: (date: string) => void): (() => void) | null;
  tableta: { token: string; dispozitiv: { id: number; nume: string; locatie_id: number } };
  tokenAdmin: string;
  /** true doar la prima pornire a aplicației în pagină: atunci tableta își golește memoria. */
  primaPornire(sursa: SursaCerere): boolean;
  /** Cadrul anunță că aplicația a pornit; pagina îi trimite apoi evenimentele online/offline. */
  pregatit(sursa: SursaCerere, fereastra: Window): void;
}
