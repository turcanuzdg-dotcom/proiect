import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { PGlite, types as pgliteTypes } from '@electric-sql/pglite';
import { dinPglite, type Db } from './db-comun';

export { insereaza, type Db } from './db-comun';

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
      // Conexiunea poate cădea în mijlocul tranzacției (PostgreSQL repornit la o actualizare): fără un
      // ascultător, evenimentul 'error' al clientului ar opri tot procesul Node.
      let pierduta: Error | undefined;
      const laEroare = (e: Error) => {
        pierduta ??= e;
      };
      client.on('error', laEroare);
      try {
        await client.query('BEGIN');
        const rez = await fn(pentruClient(client));
        await client.query('COMMIT');
        return rez;
      } catch (e) {
        // Un ROLLBACK eșuat (conexiune pierdută) nu ascunde eroarea care a oprit tranzacția.
        await client.query('ROLLBACK').catch((r: Error) => {
          pierduta ??= r;
        });
        throw e;
      } finally {
        client.off('error', laEroare);
        // Cu eroare, pool-ul închide clientul în loc să-l dea mai departe altei cereri.
        client.release(pierduta);
      }
    },
    close: () => pool.end(),
  };
}

export interface OptiuniDb {
  /** postgres://... ; dacă lipsește se folosește PGlite. */
  url?: string;
  /**
   * Opțional, doar cu `url`: rolul care deține schema (tabelele). Migrațiile neaplicate se aplică
   * printr-o conexiune scurtă cu acest rol, iar serverul lucrează apoi prin `url`, care poate fi un rol
   * doar cu drepturi pe date (SELECT/INSERT/UPDATE/DELETE): fără ALTER, DROP sau dezactivarea
   * declanșatorilor care păzesc registrele. Fără el, migrațiile se aplică prin `url`, ca până acum.
   */
  urlMigrari?: string;
  /** Director pentru datele PGlite; lipsă = în memorie (teste). */
  director?: string;
}

function poolNou(url: string, max: number): pg.Pool {
  const pool = new pg.Pool({
    connectionString: url,
    max,
    // Fără conexiune liberă în 10 s, cererea eșuează (tableta reîncearcă) în loc să aștepte la nesfârșit.
    connectionTimeoutMillis: 10_000,
    // O interogare scăpată de sub control nu ține ocupată o conexiune din cele 10 (migrațiile ridică limita).
    statement_timeout: 30_000,
    idle_in_transaction_session_timeout: 60_000,
    application_name: 'cafenea',
  });
  // O conexiune inactivă închisă de server (PostgreSQL repornit la o actualizare) nu oprește procesul:
  // pool-ul o scoate și deschide alta la următoarea cerere.
  pool.on('error', (e) => console.error(`PostgreSQL: conexiune pierdută (${e.message})`));
  return pool;
}

export async function deschideDb(opt: OptiuniDb = {}): Promise<Db> {
  let db: Db;
  if (opt.url) {
    pg.types.setTypeParser(NUMERIC, parseFloat);
    pg.types.setTypeParser(INT8, Number);
    db = dinPool(poolNou(opt.url, 10));
  } else {
    const lite = new PGlite({
      dataDir: opt.director,
      parsers: { [pgliteTypes.NUMERIC]: parseFloat, [pgliteTypes.INT8]: Number },
    });
    await lite.waitReady;
    db = dinPglite(lite);
  }
  try {
    if (opt.url && opt.urlMigrari) await aplicaMigrariCaProprietar(db, opt.urlMigrari);
    else await aplicaMigrari(db);
  } catch (e) {
    await db.close();
    throw e;
  }
  return db;
}

const DIR_MIGRARI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrari');

const fisiereMigrari = async () => (await readdir(DIR_MIGRARI)).filter((f) => f.endsWith('.sql')).sort();

async function aplicaMigrari(db: Db): Promise<void> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrari (nume text PRIMARY KEY, aplicata_la timestamptz NOT NULL DEFAULT now())');
  const aplicate = new Set((await db.query<{ nume: string }>('SELECT nume FROM schema_migrari')).map((r) => r.nume));
  for (const f of await fisiereMigrari()) {
    if (aplicate.has(f)) continue;
    const sql = await readFile(path.join(DIR_MIGRARI, f), 'utf8');
    await db.tx(async (t) => {
      // Limita de 30 s a interogărilor nu se aplică migrațiilor: un index pe un tabel mare poate dura mai mult.
      await t.exec('SET LOCAL statement_timeout = 0');
      await t.exec(sql);
      await t.query('INSERT INTO schema_migrari (nume) VALUES ($1)', [f]);
    });
  }
}

/** Ce migrații lipsesc, aflat fără nicio comandă DDL (merge și cu un rol doar cu drepturi pe date). */
export async function migrariNeaplicate(db: Db): Promise<string[]> {
  const [{ tabel }] = await db.query<{ tabel: string | null }>(`SELECT to_regclass('public.schema_migrari')::text AS tabel`);
  const aplicate = new Set(tabel ? (await db.query<{ nume: string }>('SELECT nume FROM schema_migrari')).map((r) => r.nume) : []);
  return (await fisiereMigrari()).filter((f) => !aplicate.has(f));
}

/** Dacă lipsesc migrații, le aplică printr-o conexiune scurtă cu rolul proprietar al schemei. */
async function aplicaMigrariCaProprietar(db: Db, urlMigrari: string): Promise<void> {
  if (!(await migrariNeaplicate(db)).length) return;
  const proprietar = dinPool(poolNou(urlMigrari, 1));
  try {
    await aplicaMigrari(proprietar);
  } finally {
    await proprietar.close();
  }
}
