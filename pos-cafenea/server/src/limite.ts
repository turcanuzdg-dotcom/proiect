/** Mărimea maximă a corpului unei cereri. Cererile JSON obișnuite sunt mici (cel mult câteva zeci de KB). */
export const LIMITA_CORP = 256 * 1024;
/** Coada de sincronizare a tabletei: loturi de câte 100 de evenimente; o comandă reală are sub 10 KB. */
export const LIMITA_CORP_SYNC = 2 * 1024 * 1024;
