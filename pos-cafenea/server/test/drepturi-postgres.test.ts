import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, types as pgliteTypes } from '@electric-sql/pglite';
import { totalComanda, type CatalogPOS } from '@cafenea/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construiesteApp } from '../src/app';
import { dinPglite } from '../src/db-comun';
import { populeazaDemo } from '../src/demo';
import { salveazaUtilizator } from '../src/servicii/acces';
import { evComanda, evTuraDeschisa } from './ajutor';

/**
 * În producție (deploy/) serverul lucrează cu rolul `cafenea_app`, care are doar SELECT/INSERT/
 * UPDATE/DELETE, iar schema e a rolului `cafenea_migrari`. Testul reface pe PGlite exact
 * drepturile din deploy/postgresql/roluri.sql și verifică două lucruri: rolul aplicației nu poate
 * schimba schema sau goli registrele, iar serverul merge totuși cap-coadă cu el (orice cod nou care
 * ar avea nevoie de DDL, TRUNCATE sau de a fi proprietar ar pica aici, nu abia în producție).
 */
const radacina = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const roluri = readFileSync(path.join(radacina, 'deploy', 'postgresql', 'roluri.sql'), 'utf8');
const dirMigrari = path.join(radacina, 'server', 'migrari');

let lite: PGlite;

/** Baza ca pe VPS: roluri, apoi migrațiile aplicate de proprietar, apoi din nou roluri.sql (idempotent). */
async function bazaCaInProductie(): Promise<PGlite> {
  const l = new PGlite({ parsers: { [pgliteTypes.NUMERIC]: parseFloat, [pgliteTypes.INT8]: Number } });
  await l.waitReady;
  await l.exec(roluri);
  await l.exec('SET ROLE cafenea_migrari');
  // La fel ca aplicaMigrari din server/src/db.ts.
  await l.exec('CREATE TABLE IF NOT EXISTS schema_migrari (nume text PRIMARY KEY, aplicata_la timestamptz NOT NULL DEFAULT now())');
  for (const f of readdirSync(dirMigrari).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(path.join(dirMigrari, f), 'utf8');
    await l.transaction(async (t) => {
      await t.exec(sql);
      await t.query('INSERT INTO schema_migrari (nume) VALUES ($1)', [f]);
    });
  }
  await l.exec('RESET ROLE');
  await l.exec(roluri);
  return l;
}

/** Rulează sql cu un rol anume și întoarce eroarea (sau null dacă a mers). */
async function caRol(rol: string, sql: string): Promise<string | null> {
  await lite.exec(`SET ROLE ${rol}`);
  try {
    await lite.exec(sql);
    return null;
  } catch (e) {
    return (e as Error).message;
  } finally {
    await lite.exec('RESET ROLE');
  }
}

beforeAll(async () => {
  lite = await bazaCaInProductie();
});
afterAll(async () => {
  await lite?.close();
});

describe('drepturile din deploy/postgresql/roluri.sql', () => {
  it('schema și tabelele sunt ale rolului de migrații', async () => {
    const r = await lite.query<{ proprietar: string; n: number }>(
      `SELECT pg_get_userbyid(c.relowner) AS proprietar, count(*)::int AS n
         FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
        WHERE s.nspname = 'public' AND c.relkind IN ('r', 'S') GROUP BY 1`,
    );
    expect(r.rows).toEqual([{ proprietar: 'cafenea_migrari', n: expect.any(Number) }]);
    const schema = await lite.query<{ p: string }>(`SELECT pg_get_userbyid(nspowner) AS p FROM pg_namespace WHERE nspname = 'public'`);
    expect(schema.rows[0].p).toBe('cafenea_migrari');
  });

  it('rolul aplicației nu poate schimba schema, goli registrele sau opri triggerele', async () => {
    for (const sql of [
      'CREATE TABLE ceva (id int)',
      'ALTER TABLE miscari_bani ADD COLUMN x int',
      'ALTER TABLE miscari_bani DISABLE TRIGGER ALL',
      'TRUNCATE miscari_bani',
      'TRUNCATE miscari_stoc',
      'DROP TABLE comenzi_linii',
      'CREATE FUNCTION f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$',
    ]) {
      expect(await caRol('cafenea_app', sql), sql).toMatch(/permission denied|must be owner/);
    }
  });

  it('rolul de citire (copiile de siguranță) citește tot, dar nu poate scrie', async () => {
    expect(await caRol('cafenea_citire', 'SELECT count(*) FROM miscari_bani; SELECT count(*) FROM schema_migrari')).toBeNull();
    // default_transaction_read_only se aplică la conectare; aici verificăm lipsa dreptului.
    expect(await caRol('cafenea_citire', `INSERT INTO locatii (nume, tip) VALUES ('X', 'punct')`)).toMatch(/permission denied/);
  });

  it('serverul merge cap-coadă doar cu drepturile rolului cafenea_app', async () => {
    await lite.exec('SET ROLE cafenea_app');
    const db = dinPglite(lite);
    expect((await db.query<{ u: string }>('SELECT current_user AS u'))[0].u).toBe('cafenea_app');
    await salveazaUtilizator(db, { nume: 'Admin', rol: 'admin', login: 'admin', parola: 'parola-test' });
    const demo = await populeazaDemo(db, { zileIstoric: 0 });
    const app = await construiesteApp({ db });
    try {
      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', parola: 'parola-test' } });
      expect(login.statusCode).toBe(200);
      const admin = { authorization: `Bearer ${login.json().token}` };
      const asociere = await app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: demo.coduri_tablete.centru } });
      const tableta = { authorization: `Bearer ${asociere.json().token}` };

      const catalog: CatalogPOS = (await app.inject({ method: 'GET', url: '/api/pos/catalog', headers: tableta })).json();
      const esp = catalog.produse.find((p) => p.nume === 'Espresso')!;
      const barista = catalog.baristi.find((b) => b.nume === 'Ana Rusu')!.id;
      const linii = [{ produs_id: esp.id, cantitate: 2, pret_unitar: esp.pret, modificatori: [] }];
      const tura = randomUUID();
      const acum = Date.now();
      const la = (minute: number) => new Date(acum - (30 - minute) * 60_000).toISOString();
      const sync = await app.inject({
        method: 'POST',
        url: '/api/pos/sync',
        headers: tableta,
        payload: {
          evenimente: [
            evTuraDeschisa(tura, barista, 500, la(0)),
            evComanda(tura, barista, linii, 'numerar', { primit: 100, la: la(1) }),
            evComanda(tura, barista, linii, 'casare', { motiv_casare: 'rebut', la: la(2) }),
            {
              id: randomUUID(), tip: 'tura_inchisa', la: la(3),
              date: { tura_id: tura, utilizator_id: barista, doze: 4, numerar: 500 + totalComanda(linii), card: 0, anulari: 0, casari: 1 },
            },
          ],
        },
      });
      expect(sync.statusCode).toBe(200);
      expect(sync.json().cu_eroare).toEqual([]);
      expect(sync.json().acceptate).toHaveLength(4);

      const { centru, depozit } = demo.locatii;
      const articole: { id: number }[] = (await app.inject({ method: 'GET', url: '/api/articole', headers: admin })).json();
      const transfer = await app.inject({
        method: 'POST',
        url: '/api/transferuri',
        headers: admin,
        payload: { din_locatie_id: depozit, in_locatie_id: centru, linii: [{ articol_id: articole[0].id, cantitate: 1 }] },
      });
      expect(transfer.statusCode, transfer.body).toBeLessThan(300);

      const perioada = `de=${new Date(acum - 86_400_000).toISOString()}&pana=${new Date(acum + 86_400_000).toISOString()}`;
      for (const url of [
        `/api/stoc?locatie_id=${centru}`,
        `/api/ture/${tura}`,
        `/api/bani/rezumat?${perioada}`,
        `/api/rapoarte/vanzari?${perioada}`,
        `/api/rapoarte/pierderi?${perioada}`,
        `/api/panou?de_azi=${encodeURIComponent(new Date(acum - 3_600_000).toISOString())}`,
        `/api/sync/erori`,
      ]) {
        const r = await app.inject({ method: 'GET', url, headers: admin });
        expect(r.statusCode, `${url}: ${r.body}`).toBe(200);
      }
      const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: admin });
      expect(logout.statusCode).toBeLessThan(300);
    } finally {
      await app.close();
      await lite.exec('RESET ROLE');
    }
  });
});

describe('scripturile din deploy/', () => {
  const scripturi = readdirSync(path.join(radacina, 'deploy'), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.sh'))
    .map((f) => path.join(radacina, 'deploy', f));

  it.skipIf(spawnSync('bash', ['--version']).status !== 0)('trec de verificarea de sintaxă bash -n', () => {
    expect(scripturi.length).toBeGreaterThan(0);
    for (const s of scripturi) {
      const r = spawnSync('bash', ['-n', s], { encoding: 'utf8' });
      expect(r.status, `${s}\n${r.stderr}`).toBe(0);
    }
  });
});
