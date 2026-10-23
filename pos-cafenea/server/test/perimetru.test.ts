import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construiesteApp, CSP } from '../src/app';
import type { Db } from '../src/db';
import { pregateste } from './ajutor';

/** Marginea serverului: antete, limite de mărime, ordinea verificărilor, erori, sănătate, oprire, proxy. */
let t: Awaited<ReturnType<typeof pregateste>>;
let dirTemp: string;
let cuInterfata: Awaited<ReturnType<typeof construiesteApp>>;

beforeAll(async () => {
  t = await pregateste();
  dirTemp = mkdtempSync(path.join(tmpdir(), 'cafenea-perimetru-'));
  const dirWeb = path.join(dirTemp, 'dist');
  mkdirSync(dirWeb);
  writeFileSync(path.join(dirWeb, 'pos.html'), '<!doctype html><title>POS</title>');
  writeFileSync(path.join(dirWeb, 'sw.js'), 'self.addEventListener("install", () => {});');
  cuInterfata = await construiesteApp({ db: t.db, dirWeb });
});
afterAll(async () => {
  await cuInterfata.close();
  await t.app.close();
  await t.db.close();
  rmSync(dirTemp, { recursive: true, force: true });
});

const login = (parola: string, extra: { remoteAddress?: string; headers?: Record<string, string>; login?: string } = {}) =>
  t.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: extra.login ?? 'admin', parola },
    remoteAddress: extra.remoteAddress,
    headers: extra.headers,
  });

describe('antete de securitate', () => {
  it('paginile au CSP strict și antetele de bază; sw.js la fel', async () => {
    for (const url of ['/pos.html', '/sw.js']) {
      const r = await cuInterfata.inject({ method: 'GET', url });
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-security-policy']).toBe(CSP);
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['referrer-policy']).toBe('no-referrer');
      expect(r.headers['x-frame-options']).toBe('DENY');
      expect(r.headers['permissions-policy']).toMatch(/camera=\(\)/);
    }
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).toContain('connect-src \'self\' http://127.0.0.1:8099');
  });

  it('API-ul nu se păstrează în cache și nu are CSP; antetele de bază sunt și pe erori', async () => {
    const ok = await t.app.inject({ method: 'GET', url: '/api/locatii', headers: { authorization: `Bearer ${t.tokenAdmin}` } });
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(ok.headers['content-security-policy']).toBeUndefined();
    const neautorizat = await t.app.inject({ method: 'GET', url: '/api/locatii' });
    expect(neautorizat.statusCode).toBe(401);
    expect(neautorizat.headers['cache-control']).toBe('no-store');
    expect(neautorizat.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('mărimea cererilor și ordinea verificărilor', () => {
  it('o cerere obișnuită peste 256 KB e refuzată cu 413', async () => {
    const r = await login('x'.repeat(300 * 1024));
    expect(r.statusCode).toBe(413);
    expect(r.json().eroare).toBe('Cererea este prea mare');
  });

  it('coada tabletei primește până la 2 MB, nu mai mult', async () => {
    const trimite = (octeti: number) =>
      t.app.inject({
        method: 'POST',
        url: '/api/pos/sync',
        headers: { authorization: `Bearer ${t.tokenTableta}`, 'content-type': 'application/json' },
        payload: JSON.stringify({ evenimente: [], umplutura: 'x'.repeat(octeti) }),
      });
    expect((await trimite(1024 * 1024)).statusCode).toBe(200);
    expect((await trimite(2.5 * 1024 * 1024)).statusCode).toBe(413);
  });

  it('fără token, cererea e refuzată înainte de citirea corpului', async () => {
    const stricat = { 'content-type': 'application/json' };
    const pos = await t.app.inject({ method: 'POST', url: '/api/pos/sync', headers: stricat, payload: '{"evenimente": [' });
    expect(pos.statusCode).toBe(401);
    const adm = await t.app.inject({ method: 'POST', url: '/api/produse', headers: stricat, payload: '{nu e json' });
    expect(adm.statusCode).toBe(401);
    const mare = await t.app.inject({ method: 'POST', url: '/api/pos/sync', headers: stricat, payload: `{"x":"${'y'.repeat(3 * 1024 * 1024)}"}` });
    expect(mare.statusCode).toBe(401);
  });
});

describe('erori', () => {
  it('o valoare respinsă de PostgreSQL (clasa 22) e 400, nu 500', async () => {
    const auth = { authorization: `Bearer ${t.tokenAdmin}` };
    const data = await t.app.inject({ method: 'GET', url: '/api/comenzi?de=garbage____', headers: auth });
    expect(data.statusCode).toBe(400);
    expect(data.json().eroare).toBe('Valoare invalidă în cerere');
    const numar = await t.app.inject({ method: 'GET', url: '/api/stoc?locatie_id=99999999999', headers: auth });
    expect(numar.statusCode).toBe(400);
  });
});

describe('verificarea de sănătate', () => {
  it('răspunde ok când baza răspunde', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/api/sanatate' });
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
  });

  it('503 când baza dă eroare sau nu răspunde în 2 s', async () => {
    const cuEroare: Db = { ...t.db, query: async () => Promise.reject(new Error('conexiune refuzată')) };
    const a = await construiesteApp({ db: cuEroare });
    expect((await a.inject({ method: 'GET', url: '/api/sanatate' })).statusCode).toBe(503);
    await a.close();

    const blocata: Db = { ...t.db, query: () => new Promise(() => {}) };
    const b = await construiesteApp({ db: blocata });
    const inceput = Date.now();
    const r = await b.inject({ method: 'GET', url: '/api/sanatate' });
    expect(r.statusCode).toBe(503);
    expect(Date.now() - inceput).toBeLessThan(4_000);
    await b.close();
  });
});

describe('oprirea serverului', () => {
  it('fluxurile de notificări deschise se închid, deci oprirea nu mai așteaptă', async () => {
    const app = await construiesteApp({ db: t.db });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as AddressInfo).port;
    const bilet = (await app.inject({ method: 'POST', url: '/api/flux/bilet', headers: { authorization: `Bearer ${t.tokenAdmin}` } })).json().bilet;
    let inchis!: () => void;
    const fluxInchis = new Promise<void>((r) => (inchis = r));
    await new Promise<void>((primit) => {
      request({ host: '127.0.0.1', port, path: `/api/flux?bilet=${bilet}` }, (res) => {
        expect(res.headers['content-type']).toMatch(/text\/event-stream/);
        res.once('data', () => primit());
        res.on('end', () => inchis());
      }).end();
    });
    const inceput = Date.now();
    await app.close();
    await fluxInchis;
    expect(Date.now() - inceput).toBeLessThan(3_000);
  });
});

/**
 * Adresa ultimului rând `login.esuat`. Loginul nu așteaptă scrierea în jurnal (ca timpul de răspuns să
 * nu arate ce conturi există), deci se așteaptă până apare rândul cu adresa așteptată.
 */
async function adresaEsec(asteptata: string): Promise<string | undefined> {
  let adresa: string | undefined;
  for (let i = 0; i < 100 && adresa !== asteptata; i++) {
    if (i) await new Promise((r) => setTimeout(r, 20));
    adresa = (await t.db.query<{ adresa: string }>(`SELECT adresa FROM jurnal_audit WHERE actiune = 'login.esuat' ORDER BY id DESC LIMIT 1`))[0]?.adresa;
  }
  return adresa;
}

describe('adresa clientului și proxy-ul', () => {
  it('un client care ajunge direct la Node nu-și poate alege adresa prin X-Forwarded-For', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await login('gresita-xff', { remoteAddress: '198.51.100.7', headers: { 'x-forwarded-for': `10.77.0.${i}` } });
      expect(r.statusCode).toBe(401);
    }
    const r = await login('gresita-xff', { remoteAddress: '198.51.100.7', headers: { 'x-forwarded-for': '10.77.0.99' } });
    expect(r.statusCode).toBe(429);
    expect(await adresaEsec('198.51.100.7')).toBe('198.51.100.7');
  });

  it('prin proxy-ul local (Caddy pe aceeași mașină), adresa vine din X-Forwarded-For', async () => {
    const r = await login('gresita-proxy', { remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': '203.0.113.44' } });
    expect(r.statusCode).toBe(401);
    expect(await adresaEsec('203.0.113.44')).toBe('203.0.113.44');
  });

  it('adresele IPv6 din același /64 se numără împreună', async () => {
    for (let i = 1; i <= 5; i++) expect((await login('gresita-v6', { remoteAddress: `2001:db8:5:6::${i}` })).statusCode).toBe(401);
    expect((await login('gresita-v6', { remoteAddress: '2001:db8:5:6:ffff:1:2:3' })).statusCode).toBe(429);
    // Alt /64: alt client.
    expect((await login('gresita-v6', { remoteAddress: '2001:db8:5:7::1' })).statusCode).toBe(401);
  });
});

describe('pornirea în producție', () => {
  const radacina = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const ruleaza = (script: string, env: Record<string, string>, argumente: string[] = []) =>
    spawnSync(process.execPath, ['--import', 'tsx', script, ...argumente], {
      cwd: radacina,
      env: { ...process.env, DATABASE_URL: '', NODE_ENV: '', ADMIN_PAROLA: '', DIR_DATE: path.join(dirTemp, 'nu-trebuie-creat'), ...env },
      encoding: 'utf8',
      timeout: 60_000,
    });

  it('NODE_ENV=production fără DATABASE_URL: serverul refuză să pornească pe PGlite', () => {
    const r = ruleaza('server/src/index.ts', { NODE_ENV: 'production', PORT: '0' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/fără DATABASE_URL/);
  });

  it('demo-ul nu se încarcă într-o bază reală sau în producție', () => {
    const cuUrl = ruleaza('server/src/seed.ts', { DATABASE_URL: 'postgres://nimeni@127.0.0.1:1/nicio_baza' });
    expect(cuUrl.status).toBe(1);
    expect(cuUrl.stderr).toMatch(/doar în baza locală de dezvoltare/);
    const productie = ruleaza('server/src/seed.ts', { NODE_ENV: 'production' });
    expect(productie.status).toBe(1);
    expect(productie.stderr).toMatch(/doar în baza locală de dezvoltare/);
  });
});
