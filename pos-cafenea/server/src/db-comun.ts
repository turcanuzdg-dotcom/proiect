import type { PGlite } from '@electric-sql/pglite';

// Partea din accesul la baza de date care nu depinde de Node: o folosește și simularea din browser.

/**
 * Acces minim la baza de date. În producție: PostgreSQL (DATABASE_URL).
 * Pentru dezvoltare și teste: PGlite (același PostgreSQL, compilat în WebAssembly),
 * deci nu e nevoie de niciun server instalat.
 */
export interface Db {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  /** Rulează fn într-o tranzacție; apelat în interiorul unei tranzacții, o refolosește. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function dinPglite(lite: PGlite): Db {
  const db: Db = {
    query: async (sql, params) => (await lite.query<any>(sql, params as any[])).rows,
    exec: async (sql) => void (await lite.exec(sql)),
    tx: (fn) =>
      lite.transaction(async (t) => {
        const interior: Db = {
          query: async (sql, params) => (await t.query<any>(sql, params as any[])).rows,
          exec: async (sql) => void (await t.exec(sql)),
          tx: (f) => f(interior),
          close: async () => {},
        };
        return fn(interior);
      }),
    close: () => lite.close(),
  };
  return db;
}

/**
 * Verificarea de sănătate: baza răspunde la `SELECT 1` în cel mult `ms`. Un pool blocat (toate
 * conexiunile ocupate, PostgreSQL oprit) nu blochează și verificarea: după timpul limită răspunsul e „nu”.
 */
export async function bazaRaspunde(db: Db, ms = 2_000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limita = new Promise<false>((rezolva) => {
    timer = setTimeout(() => rezolva(false), ms);
  });
  try {
    return await Promise.race([db.query('SELECT 1').then(() => true), limita]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** INSERT cu mai multe rânduri într-o singură interogare. */
export async function insereaza(
  db: Db,
  tabel: string,
  coloane: string[],
  randuri: unknown[][],
  retur = '',
): Promise<any[]> {
  if (randuri.length === 0) return [];
  const params: unknown[] = [];
  const valori = randuri.map((r) => {
    const loc = r.map((v) => {
      params.push(v);
      return `$${params.length}`;
    });
    return `(${loc.join(', ')})`;
  });
  const sql = `INSERT INTO ${tabel} (${coloane.join(', ')}) VALUES ${valori.join(', ')}${retur ? ` RETURNING ${retur}` : ''}`;
  return db.query(sql, params);
}
