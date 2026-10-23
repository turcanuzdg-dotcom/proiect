import type { Db } from '../db';

/** Pragurile peste care o diferență la închiderea turei ajunge ca alertă la admin. */
export interface Tolerante {
  numerar: number;
  card: number;
  doze: number;
}

export const TOLERANTE_IMPLICITE: Tolerante = { numerar: 5, card: 0.5, doze: 2 };

export async function citesteSetare<T>(db: Db, cheie: string, implicit: T): Promise<T> {
  const r = await db.query<{ valoare: T }>('SELECT valoare FROM setari WHERE cheie = $1', [cheie]);
  return r[0] ? { ...implicit, ...r[0].valoare } : implicit;
}

export async function scrieSetare(db: Db, cheie: string, valoare: unknown): Promise<void> {
  await db.query(
    `INSERT INTO setari (cheie, valoare) VALUES ($1, $2)
     ON CONFLICT (cheie) DO UPDATE SET valoare = EXCLUDED.valoare`,
    [cheie, JSON.stringify(valoare)],
  );
}

export const citesteTolerante = (db: Db) => citesteSetare(db, 'tolerante', TOLERANTE_IMPLICITE);

/** Comportamentul tabletelor, trimis în catalog. */
export interface SetariTableta {
  /** Simulatorul și puntea locală apar pe tablete (instruire, demonstrații); altfel doar în dezvoltare. */
  mod_demonstratie: boolean;
  /** După câte minute fără atingere tableta revine la ecranul de PIN. */
  blocare_automata_min: number;
}

export const SETARI_TABLETA_IMPLICITE: SetariTableta = { mod_demonstratie: false, blocare_automata_min: 5 };

export const citesteSetariTableta = (db: Db) => citesteSetare(db, 'tableta', SETARI_TABLETA_IMPLICITE);
