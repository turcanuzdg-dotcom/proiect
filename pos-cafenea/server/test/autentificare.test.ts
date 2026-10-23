import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { sha256Hex } from '@cafenea/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construiesteApp } from '../src/app';
import { deschideDb } from '../src/db';
import { grupAdresa, hashParola, LimitatorHash, ProtectieLogin } from '../src/servicii/acces';
import { JurnalLoginNecunoscut } from '../src/servicii/audit';
import { pregateste } from './ajutor';

let t: Awaited<ReturnType<typeof pregateste>>;
beforeAll(async () => {
  t = await pregateste();
});
afterAll(async () => {
  await t.app.close();
  await t.db.close();
});

const login = (loginNume: string, parola: string, remoteAddress?: string) =>
  t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: loginNume, parola }, remoteAddress });
const cuToken = (token: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as any, headers: { authorization: `Bearer ${token}` } });

describe('grupul adresei', () => {
  it('IPv4 (și IPv4 scris ca IPv6) rămâne adresa întreagă', () => {
    expect(grupAdresa('203.0.113.5')).toBe('203.0.113.5');
    expect(grupAdresa('::ffff:203.0.113.5')).toBe('203.0.113.5');
  });

  it('IPv6 se grupează pe /64, oricum ar fi scris', () => {
    expect(grupAdresa('2001:db8:1:2::a')).toBe('2001:db8:1:2::/64');
    expect(grupAdresa('2001:0DB8:0001:0002:ffff:0:0:1')).toBe('2001:db8:1:2::/64');
    expect(grupAdresa('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(grupAdresa('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(grupAdresa('::1')).toBe('0:0:0:0::/64');
    expect(grupAdresa('2001:db8:1:3::a')).not.toBe(grupAdresa('2001:db8:1:2::a'));
  });
});

describe('protecția loginului (cu timp simulat)', () => {
  const T0 = 1_800_000_000_000;
  const refuzat = (f: () => void, mesaj: RegExp) => {
    try {
      f();
    } catch (e: any) {
      expect(e.status).toBe(429);
      expect(e.message).toMatch(mesaj);
      return;
    }
    throw new Error('trebuia refuzat');
  };

  it('după 5 eșecuri de pe aceeași adresă, o pauză care se dublează', () => {
    const p = new ProtectieLogin();
    for (let i = 0; i < 5; i++) {
      p.verifica('ana', '10.0.0.1', T0);
      p.esec('ana', '10.0.0.1', true, T0);
    }
    refuzat(() => p.verifica('ana', '10.0.0.1', T0 + 29_000), /reîncercați în 1 s/);
    p.verifica('ana', '10.0.0.2', T0); // altă adresă
    p.verifica('ana', '10.0.0.1', T0 + 30_000);
    p.esec('ana', '10.0.0.1', true, T0 + 30_000);
    refuzat(() => p.verifica('ana', '10.0.0.1', T0 + 30_000 + 59_000), /Prea multe încercări/);
  });

  it('după 20 de eșecuri pe un cont, din oricâte adrese: cel mult o încercare la 10 s', () => {
    const p = new ProtectieLogin();
    for (let i = 0; i < 20; i++) {
      p.verifica('admin', `10.1.${i}.1`, T0 + i);
      p.esec('admin', `10.1.${i}.1`, true, T0 + i);
    }
    p.verifica('admin', '10.2.0.1', T0 + 100); // prima încercare din fereastră trece
    refuzat(() => p.verifica('admin', '10.2.0.2', T0 + 200), /pentru acest cont; reîncercați în 10 s/);
    p.verifica('admin', '10.2.0.3', T0 + 10_200);
    refuzat(() => p.verifica('admin', '10.2.0.3', T0 + 10_300), /pentru acest cont/);
    // Alt cont nu e afectat; după 15 minute fără eșecuri, nici acesta.
    p.verifica('ana', '10.2.0.2', T0 + 300);
    p.verifica('admin', '10.2.0.9', T0 + 16 * 60_000);
    p.verifica('admin', '10.2.0.9', T0 + 16 * 60_000 + 1);
  });

  it('o adresă de pe care contul a intrat cu succes nu e încetinită de atacul din alte adrese', () => {
    const p = new ProtectieLogin();
    p.reusit('admin', '192.0.2.10', T0);
    for (let i = 0; i < 25; i++) p.esec('admin', `10.3.${i}.1`, true, T0 + i);
    refuzat(() => {
      p.verifica('admin', '10.4.0.1', T0 + 100);
      p.verifica('admin', '10.4.0.2', T0 + 101);
    }, /pentru acest cont/);
    p.verifica('admin', '192.0.2.10', T0 + 102);
    p.verifica('admin', '192.0.2.10', T0 + 103);
  });

  it('un val de loginuri inventate nu șterge încetinirea contului real, iar tabelele rămân mărginite', () => {
    const p = new ProtectieLogin({ maxIntrari: 50 });
    for (let i = 0; i < 25; i++) p.esec('admin', `10.5.${i}.1`, true, T0 + i);
    for (let i = 0; i < 5; i++) p.esec('admin', '10.6.0.1', true, T0 + 30 + i);
    // 500 de loginuri inventate, din 500 de adrese.
    for (let i = 0; i < 500; i++) p.esec(`inventat${i}`, `10.7.${i >> 8}.${i & 255}`, false, T0 + 100 + i);
    const m = p.marime();
    expect(m.peAdresa).toBeLessThanOrEqual(50);
    expect(m.peLogin).toBeLessThanOrEqual(50);
    // Contul real rămâne încetinit (intrarea lui nu a fost aruncată).
    p.verifica('admin', '10.8.0.1', T0 + 1_000);
    refuzat(() => p.verifica('admin', '10.8.0.2', T0 + 1_001), /pentru acest cont/);
  });
});

describe('limitarea calculelor de parolă', () => {
  it('cel mult 2 în paralel, 20 la coadă, apoi 429 imediat; ordinea se păstrează', async () => {
    const l = new LimitatorHash(2, 20);
    let active = 0;
    let maxim = 0;
    const ordine: number[] = [];
    const deblocheaza: (() => void)[] = [];
    const sarcina = (i: number) =>
      l.ruleaza(async () => {
        active++;
        maxim = Math.max(maxim, active);
        await new Promise<void>((r) => deblocheaza.push(r));
        ordine.push(i);
        active--;
      });
    const toate = Array.from({ length: 22 }, (_, i) => sarcina(i));
    await expect(sarcina(99)).rejects.toMatchObject({ status: 429 });
    while (ordine.length < 22) {
      await new Promise((r) => setTimeout(r, 0));
      deblocheaza.shift()?.();
    }
    await Promise.all(toate);
    expect(maxim).toBe(2);
    expect(ordine).toEqual(Array.from({ length: 22 }, (_, i) => i));
  });

  it('un val de loginuri simultane primește 429, iar adminul poate intra imediat după', async () => {
    const raspunsuri = await Promise.all(
      Array.from({ length: 60 }, (_, i) => login(`necunoscut${i}`, 'oricare-parola', `10.60.${i}.1`)),
    );
    const coduri = raspunsuri.map((r) => r.statusCode);
    expect(coduri.filter((c) => c === 429).length).toBeGreaterThan(0);
    expect(coduri.every((c) => c === 401 || c === 429)).toBe(true);
    expect(raspunsuri.find((r) => r.statusCode === 429)!.json().eroare).toMatch(/în același timp/);
    expect((await login('admin', 'parola-test-admin', '10.61.0.1')).statusCode).toBe(200);
  });

  it('pe server, contul cu 20 de eșecuri e încetinit, dar intră de pe adresa lui obișnuită', async () => {
    await t.admin.post('/api/utilizatori', { nume: 'Șef tură', rol: 'admin', login: 'sef', parola: 'parola-sefului-1', pin: null, locatie_id: null, activ: true });
    expect((await login('sef', 'parola-sefului-1', '192.0.2.50')).statusCode).toBe(200);
    for (let i = 0; i < 20; i++) expect((await login('sef', 'ghicit', `10.62.${i}.1`)).statusCode).toBe(401);
    expect((await login('sef', 'ghicit', '10.63.0.1')).statusCode).toBe(401); // încercarea permisă din cele 10 s
    const r = await login('sef', 'parola-sefului-1', '10.63.0.2');
    expect(r.statusCode).toBe(429);
    expect(r.json().eroare).toMatch(/pentru acest cont/);
    expect((await login('sef', 'parola-sefului-1', '192.0.2.50')).statusCode).toBe(200);
  });
});

describe('conturi', () => {
  it('parola unui administrator pusă din panou are cel puțin 12 caractere', async () => {
    const corp = { nume: 'Admin nou', rol: 'admin', login: 'admin-nou', pin: null, locatie_id: null, activ: true };
    const scurta = await cuToken(t.tokenAdmin, 'POST', '/api/utilizatori', { ...corp, parola: 'unsprezece1' });
    expect(scurta.statusCode).toBe(400);
    expect(scurta.json().eroare).toMatch(/cel puțin 12 caractere/);
    expect((await cuToken(t.tokenAdmin, 'POST', '/api/utilizatori', { ...corp, parola: 'doisprezece1' })).statusCode).toBe(200);
  });

  it('un administrator nu are PIN, deci nu ajunge pe tablete', async () => {
    const { id } = await t.admin.post('/api/utilizatori', { nume: 'Viitor admin', rol: 'barista', pin: '4321', locatie_id: null, activ: true });
    let catalog = await t.tableta.get('/api/pos/catalog');
    expect(catalog.baristi.some((b: any) => b.id === id)).toBe(true);
    await t.admin.put(`/api/utilizatori/${id}`, { nume: 'Viitor admin', rol: 'admin', login: 'viitor', parola: 'parola-viitorului', pin: '4321', locatie_id: null, activ: true });
    const u = (await t.admin.get('/api/utilizatori')).find((x: any) => x.id === id);
    expect(u.are_pin).toBe(false);
    catalog = await t.tableta.get('/api/pos/catalog');
    expect(catalog.baristi.some((b: any) => b.id === id)).toBe(false);
  });
});

describe('tokenuri și sesiuni', () => {
  it('în bază stă doar amprenta tokenurilor, nu tokenul', async () => {
    const sesiuni = await t.db.query<{ token: string }>('SELECT token FROM sesiuni');
    expect(sesiuni.some((s) => s.token === t.tokenAdmin)).toBe(false);
    expect(sesiuni.some((s) => s.token === sha256Hex(t.tokenAdmin))).toBe(true);
    const tablete = await t.db.query<{ token: string }>('SELECT token FROM dispozitive WHERE token IS NOT NULL');
    expect(tablete.some((d) => d.token === t.tokenTableta)).toBe(false);
    expect(tablete.some((d) => d.token === sha256Hex(t.tokenTableta))).toBe(true);
    // Amprenta furată din bază nu e un token valid.
    expect((await cuToken(sha256Hex(t.tokenAdmin), 'GET', '/api/auth/eu')).statusCode).toBe(401);
  });

  it('ieșirea șterge sesiunea', async () => {
    const token = (await login('admin', 'parola-test-admin')).json().token;
    expect((await cuToken(token, 'POST', '/api/auth/logout', {})).statusCode).toBe(200);
    expect((await cuToken(token, 'GET', '/api/auth/eu')).statusCode).toBe(401);
    expect(await t.db.query('SELECT 1 FROM sesiuni WHERE token = $1', [sha256Hex(token)])).toHaveLength(0);
  });

  it('o sesiune ține cel mult 30 de zile, oricât ar fi folosită', async () => {
    const token = (await login('admin', 'parola-test-admin')).json().token;
    const a = sha256Hex(token);
    // Aproape de capăt: prelungirea nu trece de 30 de zile de la creare.
    await t.db.query(`UPDATE sesiuni SET creata_la = now() - interval '29 days', expira_la = now() + interval '1 day' WHERE token = $1`, [a]);
    expect((await cuToken(token, 'GET', '/api/auth/eu')).statusCode).toBe(200);
    const [s] = await t.db.query<{ ramas_ore: number }>(`SELECT extract(epoch FROM expira_la - now()) / 3600 AS ramas_ore FROM sesiuni WHERE token = $1`, [a]);
    expect(s.ramas_ore).toBeLessThan(25);
    await t.db.query(`UPDATE sesiuni SET creata_la = now() - interval '31 days', expira_la = now() + interval '5 days' WHERE token = $1`, [a]);
    expect((await cuToken(token, 'GET', '/api/auth/eu')).statusCode).toBe(401);
  });

  it('sesiunile expirate se șterg la autentificare', async () => {
    const [{ id }] = await t.db.query<{ id: number }>(`SELECT id FROM utilizatori WHERE login = 'admin'`);
    await t.db.query(`INSERT INTO sesiuni (token, utilizator_id, expira_la) VALUES ('expirata-1', $1, now() - interval '1 hour')`, [id]);
    await t.db.query(`INSERT INTO sesiuni (token, utilizator_id, creata_la, expira_la) VALUES ('prea-veche-1', $1, now() - interval '40 days', now() + interval '1 day')`, [id]);
    expect((await login('admin', 'parola-test-admin')).statusCode).toBe(200);
    expect(await t.db.query(`SELECT 1 FROM sesiuni WHERE token IN ('expirata-1', 'prea-veche-1')`)).toHaveLength(0);
  });

  it('dezactivarea tabletei îi șterge tokenul; reactivarea cere un cod nou', async () => {
    const d = await t.admin.post('/api/dispozitive', { nume: 'Tabletă revocare', locatie_id: t.demo.locatii.centru });
    const token = (await t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: d.cod_asociere } })).json().token;
    expect((await cuToken(token, 'GET', '/api/pos/catalog')).statusCode).toBe(200);
    // Reactivarea unei tablete deja active nu schimbă nimic.
    expect((await t.admin.put(`/api/dispozitive/${d.id}/activ`, { activ: true })).cod_asociere).toBeNull();
    expect((await cuToken(token, 'GET', '/api/pos/catalog')).statusCode).toBe(200);

    await t.admin.put(`/api/dispozitive/${d.id}/activ`, { activ: false });
    const [r] = await t.db.query<{ token: string | null }>('SELECT token FROM dispozitive WHERE id = $1', [d.id]);
    expect(r.token).toBeNull();
    expect((await cuToken(token, 'GET', '/api/pos/catalog')).statusCode).toBe(401);

    const { cod_asociere } = await t.admin.put(`/api/dispozitive/${d.id}/activ`, { activ: true });
    expect(cod_asociere).toMatch(/^[A-Z2-9]{8}$/);
    expect((await cuToken(token, 'GET', '/api/pos/catalog')).statusCode).toBe(401);
    const nou = (await t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: cod_asociere } })).json().token;
    expect((await cuToken(nou, 'GET', '/api/pos/catalog')).statusCode).toBe(200);
  });
});

describe('migrația 004 pe o bază existentă', () => {
  it('tokenurile vechi merg mai departe după conversia în amprente; nimeni nu se re-asociază', async () => {
    const dirMigrari = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrari');
    const vechi = ['001_initial.sql', '002_inventariere_unica.sql', '003_terminal_fiscal.sql'];
    const baza = await bazaGoala();
    try {
      await baza.exec('CREATE TABLE schema_migrari (nume text PRIMARY KEY, aplicata_la timestamptz NOT NULL DEFAULT now())');
      for (const f of vechi) {
        await baza.exec(readFileSync(path.join(dirMigrari, f), 'utf8'));
        await baza.exec(`INSERT INTO schema_migrari (nume) VALUES ('${f}')`);
      }
      const sare = 'sare-veche';
      const hash = await hashParola('parola-veche-admin', sare);
      await baza.exec(`
        INSERT INTO locatii (nume, tip) VALUES ('Centru', 'punct');
        INSERT INTO utilizatori (nume, rol, login, parola_hash, pin_hash, sare) VALUES ('Admin', 'admin', 'admin', '${hash}', 'pin-vechi', '${sare}');
        INSERT INTO sesiuni (token, utilizator_id, expira_la) VALUES ('token-sesiune-vechi', 1, now() + interval '5 days');
        INSERT INTO sesiuni (token, utilizator_id, expira_la) VALUES ('token-sesiune-expirat', 1, now() - interval '1 day');
        INSERT INTO dispozitive (nume, locatie_id, token) VALUES ('Tabletă veche', 1, 'token-tableta-vechi');
        INSERT INTO dispozitive (nume, locatie_id, token, activ) VALUES ('Tabletă dezactivată', 1, 'token-dezactivat', false);
      `);
      await baza.inchide();

      const db = await baza.deschide();
      const app = await construiesteApp({ db });
      try {
        const eu = await app.inject({ method: 'GET', url: '/api/auth/eu', headers: { authorization: 'Bearer token-sesiune-vechi' } });
        expect(eu.statusCode).toBe(200);
        const catalog = await app.inject({ method: 'GET', url: '/api/pos/catalog', headers: { authorization: 'Bearer token-tableta-vechi' } });
        expect(catalog.statusCode).toBe(200);
        const tablete = await db.query<{ nume: string; token: string | null }>('SELECT nume, token FROM dispozitive ORDER BY id');
        expect(tablete).toEqual([
          { nume: 'Tabletă veche', token: sha256Hex('token-tableta-vechi') },
          { nume: 'Tabletă dezactivată', token: null },
        ]);
        expect(await db.query(`SELECT token FROM sesiuni`)).toEqual([{ token: sha256Hex('token-sesiune-vechi') }]);
        expect((await db.query<{ pin_hash: string | null }>(`SELECT pin_hash FROM utilizatori`))[0].pin_hash).toBeNull();
      } finally {
        await app.close();
        await db.close();
      }
    } finally {
      await baza.sterge();
    }
  });
});

/** O bază fără nicio migrație, pe PGlite (director temporar) sau pe PostgreSQL (TEST_DATABASE_URL). */
async function bazaGoala() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const dir = mkdtempSync(path.join(tmpdir(), 'cafenea-migrare-'));
    const lite = new PGlite({ dataDir: dir });
    await lite.waitReady;
    return {
      exec: async (sql: string) => void (await lite.exec(sql)),
      inchide: () => lite.close(),
      deschide: () => deschideDb({ director: dir }),
      sterge: async () => rmSync(dir, { recursive: true, force: true }),
    };
  }
  const pg = (await import('pg')).default;
  const nume = `test_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${nume}`);
  const u = new URL(url);
  u.pathname = `/${nume}`;
  const client = new pg.Client({ connectionString: u.toString() });
  await client.connect();
  return {
    exec: async (sql: string) => void (await client.query(sql)),
    inchide: () => client.end(),
    deschide: () => deschideDb({ url: u.toString() }),
    sterge: async () => {
      await admin.query(`DROP DATABASE IF EXISTS ${nume}`);
      await admin.end();
    },
  };
}

describe('jurnalul loginurilor inexistente (JurnalLoginNecunoscut)', () => {
  const MINUT = JurnalLoginNecunoscut.INTERVAL;

  it('o adresă: primul eșec se scrie imediat, apoi cel mult un rând pe minut, cu numărul de încercări', () => {
    const j = new JurnalLoginNecunoscut();
    const t0 = 1_000_000;
    const randuri = [];
    for (let i = 0; i < 200; i++) randuri.push(...j.esec('203.0.113.9', `nume-${i}`, t0 + i * 100));
    expect(randuri).toHaveLength(1);
    expect(randuri[0]).toMatchObject({ actiune: 'login.esuat.necunoscut', adresa: '203.0.113.9', stare_http: 401, date: { incercari: 1, exemple: ['nume-0'] } });
    const urmator = j.esec('203.0.113.9', 'inca-unul', t0 + MINUT);
    expect(urmator).toHaveLength(1);
    expect(urmator[0].date).toMatchObject({ incercari: 200, exemple: ['nume-1', 'nume-2', 'nume-3'] });
  });

  it('IPv6 din același /64 e o singură adresă; ce a rămas nescris pleacă la eșecul altei adrese', () => {
    const j = new JurnalLoginNecunoscut();
    const t0 = 5_000_000;
    let n = 0;
    for (let i = 1; i <= 50; i++) n += j.esec(`2001:db8:1:2::${i.toString(16)}`, 'x', t0 + i).length;
    expect(n).toBe(1);
    const dupa = j.esec('192.0.2.1', 'y', t0 + MINUT + 10);
    expect(dupa.map((r) => r.adresa).sort()).toEqual(['192.0.2.1', '2001:db8:1:2::32']);
    expect(dupa.find((r) => r.adresa === '2001:db8:1:2::32')!.date).toMatchObject({ incercari: 49 });
  });

  it('multe adrese în același minut: cel mult MAX_RANDURI_PE_MINUT rânduri, restul într-un rând comun', () => {
    const j = new JurnalLoginNecunoscut();
    const t0 = 9_000_000;
    let randuri = [];
    for (let i = 0; i < 500; i++) randuri.push(...j.esec(`198.51.${i >> 8}.${i & 255}`, `n${i}`, t0 + i));
    expect(randuri).toHaveLength(JurnalLoginNecunoscut.MAX_RANDURI_PE_MINUT);
    randuri = j.esec('198.51.100.1', 'ultimul', t0 + 2 * MINUT);
    const comun = randuri.find((r) => r.adresa === null);
    expect(comun?.date).toMatchObject({ incercari: 500 - JurnalLoginNecunoscut.MAX_RANDURI_PE_MINUT });
    // Nicio încercare pierdută: rândurile scrise le cuprind pe toate.
    expect(randuri.length).toBeLessThanOrEqual(JurnalLoginNecunoscut.MAX_RANDURI_PE_MINUT + 1);
  });

  it('memoria e plafonată: grupurile vechi pleacă, încercările lor trec în rândul comun', () => {
    const j = new JurnalLoginNecunoscut(100);
    const t0 = 20_000_000;
    for (let i = 0; i < 1_000; i++) j.esec(`10.${i >> 8}.${i & 255}.1`, 'z', t0 + i);
    expect(j.marime()).toBeLessThanOrEqual(101);
    const r = j.esec('10.200.0.1', 'z', t0 + 2 * MINUT);
    const total = r.reduce((s, x) => s + ((x.date as { incercari: number }).incercari ?? 0), 0);
    expect(total).toBe(1_001 - JurnalLoginNecunoscut.MAX_RANDURI_PE_MINUT);
  });

  it('vida (la oprire): tot ce e nescris, inclusiv rândul comun, fără plafonul pe minut', () => {
    const j = new JurnalLoginNecunoscut();
    const t0 = 40_000_000;
    let scrise = 0;
    // 300 de adrese, câte două încercări: primele MAX_RANDURI_PE_MINUT se scriu imediat, restul așteaptă.
    for (let k = 0; k < 2; k++) for (let i = 0; i < 300; i++) scrise += j.esec(`198.18.${i >> 8}.${i & 255}`, `v${k}`, t0 + k * 1_000 + i).length;
    expect(scrise).toBe(JurnalLoginNecunoscut.MAX_RANDURI_PE_MINUT);
    const ramase = j.vida(t0 + 5_000);
    expect(ramase.length).toBeGreaterThan(JurnalLoginNecunoscut.MAX_RANDURI_PE_MINUT);
    expect(ramase.some((r) => r.adresa === null)).toBe(true);
    const total = ramase.reduce((s, x) => s + (x.date as { incercari: number }).incercari, 0);
    expect(total + scrise).toBe(600);
    // A doua golire nu mai are nimic.
    expect(j.vida(t0 + 6_000)).toEqual([]);
  });
});
