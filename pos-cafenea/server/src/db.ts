import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { PGlite, types as pgliteTypes } from '@electric-sql/pglite';

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

const NUMERIC = 1700;
const INT8 = 20;

function dinPool(pool: pg.Pool): Db {
  const pentruClient = (client: pg.PoolClient): Db => {
    const db: Db = {
      query: async (sql, params) => (await client.query(sql, params as any[])).rows,
      exec: async (sql) => void (await client.query(sql)),
      tx: (fn) => fn(db),
      close: async () => {},
    };
    return db;
  };
  return {
    query: async (sql, params) => (await pool.query(sql, params as any[])).rows,
    exec: async (sql) => void (await pool.query(sql)),
    tx: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const rez = await fn(pentruClient(client));
        await client.query('COMMIT');
        return rez;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

function dinPglite(lite: PGlite): Db {
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

export interface OptiuniDb {
  /** postgres://... ; dacă lipsește se folosește PGlite. */
  url?: string;
  /** Director pentru datele PGlite; lipsă = în memorie (teste). */
  director?: string;
}

export async function deschideDb(opt: OptiuniDb = {}): Promise<Db> {
  let db: Db;
  if (opt.url) {
    pg.types.setTypeParser(NUMERIC, parseFloat);
    pg.types.setTypeParser(INT8, Number);
    db = dinPool(new pg.Pool({ connectionString: opt.url, max: 10 }));
  } else {
    const lite = new PGlite({
      dataDir: opt.director,
      parsers: { [pgliteTypes.NUMERIC]: parseFloat, [pgliteTypes.INT8]: Number },
    });
    await lite.waitReady;
    db = dinPglite(lite);
  }
  await aplicaMigrari(db);
  return db;
}

const DIR_MIGRARI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrari');

async function aplicaMigrari(db: Db): Promise<void> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrari (nume text PRIMARY KEY, aplicata_la timestamptz NOT NULL DEFAULT now())');
  const aplicate = new Set((await db.query<{ nume: string }>('SELECT nume FROM schema_migrari')).map((r) => r.nume));
  const fisiere = (await readdir(DIR_MIGRARI)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of fisiere) {
    if (aplicate.has(f)) continue;
    const sql = await readFile(path.join(DIR_MIGRARI, f), 'utf8');
    await db.tx(async (t) => {
      await t.exec(sql);
      await t.query('INSERT INTO schema_migrari (nume) VALUES ($1)', [f]);
    });
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
