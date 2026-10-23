import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deschideDb, type Db } from '../src/db';
import { populeazaDemo } from '../src/demo';
import { salveazaUtilizator } from '../src/servicii/acces';
import { bazaDeTest } from './ajutor';

/**
 * Comportamente care există doar pe un PostgreSQL real (conexiuni în rețea, roluri, procese):
 * rulează cu TEST_DATABASE_URL=postgres://postgres@.../postgres (un utilizator cu drept de superuser).
 */
const URL_TEST = process.env.TEST_DATABASE_URL;
const radacina = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sufix = () => randomUUID().replace(/-/g, '').slice(0, 12);

describe.skipIf(!URL_TEST)('PostgreSQL real', () => {
  let pg: typeof import('pg').default;
  let admin: import('pg').Client;
  const baze: string[] = [];
  const roluri: string[] = [];

  const urlPentru = (baza: string, rol?: string) => {
    const u = new URL(URL_TEST!);
    u.pathname = `/${baza}`;
    if (rol) {
      u.username = rol;
      u.password = '';
    }
    return u.toString();
  };
  const bazaNoua = async (proprietar?: string) => {
    const nume = `test_${sufix()}`;
    await admin.query(`CREATE DATABASE ${nume}${proprietar ? ` OWNER ${proprietar}` : ''}`);
    baze.push(nume);
    return nume;
  };

  beforeAll(async () => {
    pg = (await import('pg')).default;
    admin = new pg.Client({ connectionString: URL_TEST });
    await admin.connect();
  });
  afterAll(async () => {
    for (const b of baze) await admin.query(`DROP DATABASE IF EXISTS ${b} WITH (FORCE)`);
    for (const r of roluri) await admin.query(`DROP ROLE IF EXISTS ${r}`);
    await admin.end();
  });

  describe('conexiunile', () => {
    let db: Db;
    beforeAll(async () => {
      db = await bazaDeTest();
    });
    afterAll(async () => db.close());

    it('pool-ul are limite de timp și un nume în pg_stat_activity', async () => {
      expect((await db.query('SHOW statement_timeout'))[0].statement_timeout).toBe('30s');
      expect((await db.query('SHOW idle_in_transaction_session_timeout'))[0].idle_in_transaction_session_timeout).toBe('1min');
      expect((await db.query('SHOW application_name'))[0].application_name).toBe('cafenea');
    });

    it('o conexiune închisă de server în mijlocul tranzacției dă o eroare, nu oprește procesul', async () => {
      const promisiune = db.tx(async (t) => {
        const [{ pid }] = await t.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        await admin.query('SELECT pg_terminate_backend($1)', [pid]);
        await new Promise((r) => setTimeout(r, 100));
        await t.query('SELECT 1');
      });
      await expect(promisiune).rejects.toThrow();
      expect((await db.query<{ x: number }>('SELECT 1 AS x'))[0].x).toBe(1);
    });

    it('conexiunile inactive închise de server (PostgreSQL repornit) nu opresc procesul', async () => {
      await Promise.all(Array.from({ length: 5 }, () => db.query('SELECT pg_sleep(0.05)')));
      const [{ baza }] = await db.query<{ baza: string }>('SELECT current_database() AS baza');
      const r = await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND application_name = 'cafenea'`, [baza]);
      expect(r.rowCount).toBeGreaterThan(0);
      await new Promise((rez) => setTimeout(rez, 300));
      expect((await db.query<{ x: number }>('SELECT 1 AS x'))[0].x).toBe(1);
      await db.tx(async (t) => t.query('SELECT 1'));
    });
  });

  describe('pornirea în producție', () => {
    const porneste = (env: Record<string, string>) =>
      spawnSync(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], {
        cwd: radacina,
        env: { ...process.env, NODE_ENV: 'production', ADMIN_PAROLA: '', HOST: '', PORT: '0', ...env },
        encoding: 'utf8',
        timeout: 60_000,
      });

    it('o bază goală fără ADMIN_PAROLA (sau cu una scurtă) nu pornește', async () => {
      const url = urlPentru(await bazaNoua());
      const fara = porneste({ DATABASE_URL: url });
      expect(fara.status).toBe(1);
      expect(fara.stderr).toMatch(/nu are niciun administrator/);
      const scurta = porneste({ DATABASE_URL: url, ADMIN_PAROLA: 'schimba-ma' });
      expect(scurta.status).toBe(1);
      expect(scurta.stderr).toMatch(/cel puțin 12 caractere/);
    });

    // Un test căzut nu lasă servere pornite în urmă.
    const porniti: import('node:child_process').ChildProcess[] = [];
    afterAll(() => {
      for (const p of porniti) if (p.exitCode === null) p.kill('SIGKILL');
    });

    /** Pornește serverul de producție; `HOST: undefined` scoate variabila din mediu (nu o lasă goală). */
    const pornesteServer = async (url: string, env: Record<string, string | undefined>) => {
      const mediu: Record<string, string | undefined> = { ...process.env, NODE_ENV: 'production', DATABASE_URL: url, PORT: '0', JURNAL: '1', ...env };
      for (const [k, v] of Object.entries(mediu)) if (v === undefined) delete mediu[k];
      const proces = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], { cwd: radacina, env: mediu as NodeJS.ProcessEnv });
      porniti.push(proces);
      let iesire = '';
      // index.ts scrie „Ascultă pe <adresa>:<port>” după listen(), deci după toate liniile Fastify.
      const legat = await new Promise<string>((rezolva, respinge) => {
        const timer = setTimeout(() => respinge(new Error(`serverul nu a pornit: ${iesire}`)), 30_000);
        const citeste = (b: Buffer) => {
          iesire += b.toString();
          const m = /Ascultă pe (\S+)/.exec(iesire);
          if (m) {
            clearTimeout(timer);
            rezolva(m[1]);
          }
        };
        proces.stdout.on('data', citeste);
        proces.stderr.on('data', citeste);
      });
      const opreste = () =>
        new Promise<number | null>((rezolva) => {
          if (proces.exitCode !== null) return rezolva(proces.exitCode);
          proces.on('exit', (c) => rezolva(c));
          proces.kill('SIGTERM');
        });
      return { legat, iesire: () => iesire, opreste };
    };

    it('cu ADMIN_PAROLA pornește, ascultă doar pe 127.0.0.1 și se oprește curat la SIGTERM', async () => {
      const url = urlPentru(await bazaNoua());
      const s = await pornesteServer(url, { ADMIN_PAROLA: 'o-parola-destul-de-lunga', HOST: undefined });
      expect(s.legat).toMatch(/^127\.0\.0\.1:\d+$/);
      // Fastify scrie câte o linie pentru fiecare interfață: pe 0.0.0.0 ar fi mai multe.
      expect(s.iesire().match(/Server listening at/g)).toHaveLength(1);
      expect(s.iesire()).toMatch(/Server listening at http:\/\/127\.0\.0\.1:\d+/);
      const sanatate = await fetch(`http://${s.legat}/api/sanatate`);
      expect(sanatate.status).toBe(200);
      expect(await s.opreste()).toBe(0);
    });

    it('o linie „HOST=” goală nu leagă serverul pe toate interfețele', async () => {
      const url = urlPentru(await bazaNoua());
      const s = await pornesteServer(url, { ADMIN_PAROLA: 'o-parola-destul-de-lunga', HOST: '' });
      expect(s.legat).toMatch(/^127\.0\.0\.1:\d+$/);
      expect(s.iesire().match(/Server listening at/g)).toHaveLength(1);
      expect(await s.opreste()).toBe(0);
    });
  });

  describe('rol separat pentru schemă', () => {
    let proprietar: string;
    let aplicatie: string;
    let baza: string;

    beforeAll(async () => {
      proprietar = `cafenea_migrari_${sufix()}`;
      aplicatie = `cafenea_app_${sufix()}`;
      await admin.query(`CREATE ROLE ${proprietar} LOGIN`);
      await admin.query(`CREATE ROLE ${aplicatie} LOGIN`);
      roluri.push(aplicatie, proprietar);
      baza = await bazaNoua(proprietar);
      // Pregătirea o singură dată, ca administrator al serverului PostgreSQL (vezi README).
      const c = new pg.Client({ connectionString: urlPentru(baza) });
      await c.connect();
      await c.query(`REVOKE ALL ON SCHEMA public FROM PUBLIC`);
      await c.query(`GRANT USAGE ON SCHEMA public TO ${aplicatie}`);
      await c.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${proprietar} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${aplicatie}`);
      await c.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${proprietar} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${aplicatie}`);
      await c.end();
    });

    it('migrațiile trec prin proprietar, serverul lucrează cu un rol doar pe date', async () => {
      // Fără DATABASE_URL_MIGRARI, rolul aplicației nu poate crea schema.
      await expect(deschideDb({ url: urlPentru(baza, aplicatie) })).rejects.toThrow(/permission denied/);

      const db = await deschideDb({ url: urlPentru(baza, aplicatie), urlMigrari: urlPentru(baza, proprietar) });
      try {
        expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM schema_migrari'))[0].n).toBeGreaterThanOrEqual(4);
        await salveazaUtilizator(db, { nume: 'Admin', rol: 'admin', login: 'admin', parola: 'parola-proba-rol' });
        await populeazaDemo(db, { zileIstoric: 1 });
        expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM miscari_stoc'))[0].n).toBeGreaterThan(0);
        // Rolul aplicației nu poate ocoli declanșatorii care păzesc registrele.
        await expect(db.query('ALTER TABLE miscari_bani DISABLE TRIGGER miscari_bani_nemodificabil')).rejects.toThrow(/owner|proprietar/i);
        await expect(db.query('UPDATE miscari_bani SET suma = 0')).rejects.toThrow(/Registrul miscari_bani/);
        await expect(db.query('DROP TABLE jurnal_audit')).rejects.toThrow(/owner|proprietar/i);
      } finally {
        await db.close();
      }

      // Nimic de aplicat: rolul proprietar nici nu mai e contactat.
      const din_nou = await deschideDb({ url: urlPentru(baza, aplicatie), urlMigrari: 'postgres://nimeni@127.0.0.1:1/nicio_baza' });
      expect((await din_nou.query<{ x: number }>('SELECT 1 AS x'))[0].x).toBe(1);
      await din_nou.close();
    });
  });
});
