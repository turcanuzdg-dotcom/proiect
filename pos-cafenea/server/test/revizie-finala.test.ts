// Corecturile reviziei finale: biletele fluxului de notificări (o folosire, reverificare, limite), codurile
// de asociere (expirare, pauze, urmă în jurnal), operațiile adminilor de dinaintea actualizării 004,
// indexul promovărilor și închiderile de solduri care eșuează mereu.
import { request, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construiesteApp, MAX_FLUXURI } from '../src/app';
import { creeazaBilet, detinatorBilet, MAX_BILETE_PE_DETINATOR } from '../src/servicii/acces';
import { ESECURI_PANA_LA_ALERTA, ESECURI_PANA_LA_INSISTENTA, planificaInchideri } from '../src/servicii/solduri';
import { evTuraDeschisa, PAROLA_ADMIN, pregateste } from './ajutor';

let t: Awaited<ReturnType<typeof pregateste>>;
beforeAll(async () => {
  t = await pregateste();
});
afterAll(async () => {
  await t.app.close();
  await t.db.close();
});

const asteapta = async (conditie: () => boolean | Promise<boolean>, ms = 3_000) => {
  const pana = Date.now() + ms;
  while (!(await conditie())) {
    if (Date.now() > pana) throw new Error('Condiția nu s-a îndeplinit la timp');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('fluxul de notificări', () => {
  // Un server real, cu pulsul (și reverificarea) la 50 ms.
  let app: Awaited<ReturnType<typeof construiesteApp>>;
  let port = 0;
  beforeAll(async () => {
    app = await construiesteApp({ db: t.db, intervalPuls: 50 });
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await app.close();
  });

  const bilet = async (token: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/flux/bilet', headers: { authorization: `Bearer ${token}` } });
    expect(r.statusCode).toBe(200);
    return r.json().bilet as string;
  };
  /** Deschide fluxul; întoarce răspunsul și o promisiune care se împlinește când serverul îl închide. */
  const deschide = (b: string) =>
    new Promise<{ res: IncomingMessage; inchis: Promise<void> }>((ok, gresit) => {
      request({ host: '127.0.0.1', port, path: `/api/flux?bilet=${encodeURIComponent(b)}` }, (res) => {
        const inchis = new Promise<void>((r) => {
          res.on('end', () => r());
          res.on('close', () => r());
        });
        res.resume();
        ok({ res, inchis });
      })
        .on('error', gresit)
        .end();
    });
  const sesiuneNoua = async () => (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', parola: PAROLA_ADMIN } })).json().token as string;

  it('un bilet se folosește o singură dată', async () => {
    const b = await bilet(t.tokenAdmin);
    const { res } = await deschide(b);
    expect(res.statusCode).toBe(200);
    const aDoua = await app.inject({ method: 'GET', url: `/api/flux?bilet=${encodeURIComponent(b)}` });
    expect(aDoua.statusCode).toBe(401);
    res.destroy();
  });

  it('un deținător are cel mult câteva bilete nefolosite: cel mai vechi pleacă', () => {
    const u = { id: 987_654, nume: 'Test bilete', rol: 'admin' as const };
    const emise = Array.from({ length: MAX_BILETE_PE_DETINATOR + 1 }, () => creeazaBilet({ utilizator: u }, 'token-test'));
    expect(detinatorBilet(emise[0])).toBeNull();
    for (const b of emise.slice(1)) expect(detinatorBilet(b)?.utilizator?.id).toBe(u.id);
    // Folosite: nu mai sunt valabile.
    expect(emise.slice(1).map((b) => detinatorBilet(b))).toEqual(emise.slice(1).map(() => null));
  });

  it('după ieșirea din panou, fluxul deschis cu acea sesiune se închide', async () => {
    const token = await sesiuneNoua();
    const { res, inchis } = await deschide(await bilet(token));
    expect(res.statusCode).toBe(200);
    // Sesiunea e încă valabilă: fluxul rămâne deschis peste câteva pulsuri.
    let terminat = false;
    void inchis.then(() => (terminat = true));
    await new Promise((r) => setTimeout(r, 200));
    expect(terminat).toBe(false);
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
    await inchis;
  });

  it('o tabletă reasociată (sau dezactivată) nu mai primește notificări pe fluxul vechi', async () => {
    const d = await t.admin.post('/api/dispozitive', { nume: 'Tabletă flux', locatie_id: t.demo.locatii.centru });
    const token = (await app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: d.cod_asociere }, remoteAddress: '192.0.2.31' })).json().token;
    const { res, inchis } = await deschide(await bilet(token));
    expect(res.statusCode).toBe(200);
    await t.admin.post(`/api/dispozitive/${d.id}/reasociere`);
    await inchis;
  });

  it(`un deținător ține cel mult ${MAX_FLUXURI} fluxuri deschise: al următorului închide cel mai vechi`, async () => {
    const token = await sesiuneNoua();
    const fluxuri = [];
    for (let i = 0; i <= MAX_FLUXURI; i++) fluxuri.push(await deschide(await bilet(token)));
    expect(fluxuri.every((f) => f.res.statusCode === 200)).toBe(true);
    await fluxuri[0].inchis;
    let alDoileaInchis = false;
    void fluxuri[1].inchis.then(() => (alDoileaInchis = true));
    await new Promise((r) => setTimeout(r, 100));
    expect(alDoileaInchis).toBe(false);
    for (const f of fluxuri) f.res.destroy();
  });
});

describe('codul de asociere', () => {
  it('expiră după 24 de ore; panoul îl arată expirat, iar „Reasociază” dă unul nou', async () => {
    const d = await t.admin.post('/api/dispozitive', { nume: 'Tabletă cod vechi', locatie_id: t.demo.locatii.centru });
    await t.db.query(`UPDATE dispozitive SET cod_asociere_la = now() - interval '25 hours' WHERE id = $1`, [d.id]);
    const r = await t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: d.cod_asociere }, remoteAddress: '192.0.2.41' });
    expect(r.statusCode).toBe(401);
    expect(r.json().eroare).toMatch(/expirat/);
    expect((await t.admin.get('/api/dispozitive')).find((x: any) => x.id === d.id)).toMatchObject({ asociat: false, cod_expirat: true });
    const nou = await t.admin.post(`/api/dispozitive/${d.id}/reasociere`);
    expect((await t.admin.get('/api/dispozitive')).find((x: any) => x.id === d.id).cod_expirat).toBe(false);
    const ok = await t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: nou.cod_asociere }, remoteAddress: '192.0.2.41' });
    expect(ok.statusCode).toBe(200);
  });

  it('după 5 coduri greșite de pe aceeași adresă urmează o pauză, chiar și pentru codul bun; eșecurile ajung în jurnal', async () => {
    const d = await t.admin.post('/api/dispozitive', { nume: 'Tabletă pauză', locatie_id: t.demo.locatii.centru });
    const incearca = (cod: string, adresa = '198.51.100.23') => t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod }, remoteAddress: adresa });
    for (let i = 0; i < 5; i++) expect((await incearca(`ZZZZZZZ${i + 2}`)).statusCode).toBe(401);
    const blocat = await incearca(d.cod_asociere);
    expect(blocat.statusCode).toBe(429);
    expect(blocat.json().eroare).toMatch(/Prea multe încercări/);
    // De pe altă adresă, codul bun merge (pauza e pe adresă).
    expect((await incearca(d.cod_asociere, '198.51.100.24')).statusCode).toBe(200);
    await asteapta(async () => (await t.db.query(`SELECT 1 FROM jurnal_audit WHERE actiune = 'asociere.esuata' AND adresa = '198.51.100.23'`)).length > 0);
  });
});

describe('administratorii fără PIN', () => {
  it('promovările se citesc din indexul parțial, nu din tot jurnalul', async () => {
    const plan = await t.db.tx(async (x) => {
      await x.exec('SET LOCAL enable_seqscan = off');
      return x.query<Record<string, string>>(
        `EXPLAIN SELECT MAX(la) FROM jurnal_audit
          WHERE actiune = 'PUT /api/utilizatori/:id' AND cale = '/api/utilizatori/1' AND stare_http = 200
            AND date->'inainte'->>'rol' = 'barista' AND date->'corp'->>'rol' = 'admin'`,
      );
    });
    expect(plan.map((r) => Object.values(r)[0]).join('\n')).toMatch(/jurnal_audit_promovari/);
  });

  it('pe o instalare de dinaintea actualizării 004, operațiile offline ale unui admin de atunci se aplică', async () => {
    const { id } = await t.admin.post('/api/utilizatori', { nume: 'Proprietar vechi', rol: 'admin', login: 'proprietar', parola: 'parola-proprietarului', locatie_id: null, activ: true });
    const vechi = await t.db.query<{ nume: string; aplicata_la: Date }>('SELECT nume, aplicata_la FROM schema_migrari');
    // Prima migrație acum un an, 004 pe 10 octombrie: o actualizare, nu o instalare nouă.
    await t.db.query(`UPDATE schema_migrari SET aplicata_la = '2025-10-01T00:00:00Z' WHERE nume < '004'`);
    await t.db.query(`UPDATE schema_migrari SET aplicata_la = '2026-10-10T00:00:00Z' WHERE nume >= '004'`);
    try {
      const inainte = evTuraDeschisa(randomUUID(), id, 500, '2026-10-05T07:00:00Z');
      const dupa = evTuraDeschisa(randomUUID(), id, 500, '2026-10-12T07:00:00Z');
      const r = await t.tableta.sync([inainte, dupa]);
      expect(r.acceptate).toEqual([inainte.id]);
      expect(r.cu_eroare.map((e: any) => e.id)).toEqual([dupa.id]);
      expect(r.cu_eroare[0].eroare).toMatch(/Proprietar vechi e administrator.*treceți-l temporar la barista/);
      await t.admin.post(`/api/sync/erori/${dupa.id}/rezolvat`);
    } finally {
      for (const m of vechi) await t.db.query('UPDATE schema_migrari SET aplicata_la = $2 WHERE nume = $1', [m.nume, m.aplicata_la]);
    }
  });
});

describe('închiderile de solduri care eșuează', () => {
  it('după câteva eșecuri la rând, ultima încercare așteaptă mai mult blocarea', async () => {
    const insistente: boolean[] = [];
    const p = planificaInchideri(t.db, {
      reincercareMs: 1,
      inchide: async ({ insistent }) => {
        insistente.push(insistent);
        if (insistente.length <= ESECURI_PANA_LA_INSISTENTA + 1) throw Object.assign(new Error('lock timeout'), { code: '55P03' });
      },
      eroare: () => {},
    });
    try {
      await asteapta(() => p.stare().ultimaReusita != null);
      expect(insistente).toEqual([...Array(ESECURI_PANA_LA_INSISTENTA).fill(false), true, true]);
    } finally {
      p.opreste();
    }
  });

  it('o închidere care cade de o jumătate de oră apare pe Panou', async () => {
    const panou = () => t.admin.get(`/api/panou?de_azi=${encodeURIComponent(new Date().toISOString())}`);
    expect((await panou()).solduri_blocate).toBeNull();
    const p = planificaInchideri(t.db, {
      reincercareMs: 1,
      inchide: async () => {
        throw Object.assign(new Error('lock timeout'), { code: '55P03' });
      },
      eroare: () => {},
    });
    try {
      await asteapta(() => p.stare().esecuriLaRand >= ESECURI_PANA_LA_ALERTA);
      expect((await panou()).solduri_blocate).toMatchObject({ esecuri: expect.any(Number), ultima_reusita: null });
    } finally {
      p.opreste();
    }
    expect((await panou()).solduri_blocate).toBeNull();
  });
});
