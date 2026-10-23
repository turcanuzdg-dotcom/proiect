import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construiesteApp } from '../src/app';
import type { Db } from '../src/db';
import { evComanda, evTuraDeschisa, PAROLA_ADMIN, pregateste } from './ajutor';

let t: Awaited<ReturnType<typeof pregateste>>;
beforeAll(async () => {
  t = await pregateste();
  // O vânzare, ca registrele de stoc și de bani să aibă rânduri.
  const tura = randomUUID();
  const esp = t.produs('Espresso');
  const r = await t.tableta.sync([
    evTuraDeschisa(tura, t.barista),
    evComanda(tura, t.barista, [{ produs_id: esp.id, cantitate: 1, pret_unitar: esp.pret, modificatori: [] }], 'numerar', { primit: esp.pret }),
  ]);
  expect(r.cu_eroare).toEqual([]);
});
afterAll(async () => {
  await t.app.close();
  await t.db.close();
});

interface Intrare {
  id: number;
  utilizator_id: number | null;
  dispozitiv_id: number | null;
  adresa: string | null;
  actiune: string;
  cale: string | null;
  stare_http: number | null;
  date: any;
}
const pauza = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Ultimul id din jurnal, după ce s-au terminat scrierile cererilor anterioare (onResponse vine după răspuns). */
async function ultimulId(): Promise<number> {
  const citeste = async () => (await t.db.query<{ id: number }>('SELECT coalesce(max(id), 0)::int AS id FROM jurnal_audit'))[0].id;
  let anterior = await citeste();
  for (;;) {
    await pauza(50);
    const acum = await citeste();
    if (acum === anterior) return acum;
    anterior = acum;
  }
}
const numar = async () => (await t.db.query<{ n: number }>('SELECT count(*)::int AS n FROM jurnal_audit'))[0].n;

/**
 * Intrările cu acțiunea dată scrise după `dupa` (cele mai noi primele). Hook-ul onResponse scrie după
 * ce răspunsul a plecat, deci pe un PostgreSQL real intrarea apare cu puțin după răspuns: se așteaptă.
 */
async function jurnal(actiune: string, dupa = 0, cate = 1): Promise<Intrare[]> {
  for (let i = 0; i < 100; i++) {
    const r = await t.db.query<Intrare>('SELECT * FROM jurnal_audit WHERE actiune = $1 AND id > $2 ORDER BY id DESC', [actiune, dupa]);
    if (r.length >= cate) return r;
    await pauza(20);
  }
  throw new Error(`În jurnal nu a apărut ${actiune}`);
}

describe('registrele nu se modifică', () => {
  for (const tabel of ['miscari_stoc', 'miscari_bani', 'jurnal_audit']) {
    it(`${tabel}: UPDATE, DELETE și TRUNCATE sunt refuzate de bază`, async () => {
      expect((await t.db.query(`SELECT count(*)::int AS n FROM ${tabel}`))[0].n).toBeGreaterThan(0);
      const coloana = tabel === 'jurnal_audit' ? 'actiune' : 'document_tip';
      for (const sql of [`UPDATE ${tabel} SET ${coloana} = ${coloana}`, `DELETE FROM ${tabel}`, `TRUNCATE ${tabel}`]) {
        const e: any = await t.db.query(sql).then(
          () => null,
          (x) => x,
        );
        expect(e, sql).not.toBeNull();
        expect(e.message).toMatch(new RegExp(`Registrul ${tabel} nu se modifică`));
        expect(e.code).toBe('23001');
      }
    });
  }

  it('scrierea de mișcări noi merge în continuare (vânzări, casă)', async () => {
    const inainte = (await t.db.query('SELECT count(*)::int AS n FROM miscari_bani'))[0].n;
    await t.admin.post('/api/bani/miscari', { locatie_id: t.demo.locatii.centru, tip: 'alimentare', suma: 100, descriere: 'Fond' });
    expect((await t.db.query('SELECT count(*)::int AS n FROM miscari_bani'))[0].n).toBe(inainte + 1);
  });
});

describe('jurnalul de audit', () => {
  it('autentificările: reușite și eșuate, cu numele de login și adresa', async () => {
    const ok = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', parola: PAROLA_ADMIN }, remoteAddress: '192.0.2.7' });
    expect(ok.statusCode).toBe(200);
    const gresit = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'nimeni', parola: 'ceva-gresit' }, remoteAddress: '192.0.2.8' });
    expect(gresit.statusCode).toBe(401);
    const [reusit] = await jurnal('login.reusit');
    expect(reusit).toMatchObject({ adresa: '192.0.2.7', stare_http: 200, date: { login: 'admin' } });
    expect(reusit.utilizator_id).toBeGreaterThan(0);
    const [esuat] = await jurnal('login.esuat');
    expect(esuat).toMatchObject({ adresa: '192.0.2.8', stare_http: 401, utilizator_id: null, date: { login: 'nimeni' } });
    // Parola nu ajunge în jurnal, nici reușită, nici greșită.
    const text = JSON.stringify(await t.db.query('SELECT * FROM jurnal_audit'));
    expect(text).not.toContain(PAROLA_ADMIN);
    expect(text).not.toContain('ceva-gresit');
  });

  it('o setare suprascrisă păstrează valoarea de dinainte', async () => {
    await t.admin.put('/api/setari/tolerante', { numerar: 5, card: 0.5, doze: 2 });
    const marca = await ultimulId();
    await t.admin.put('/api/setari/tolerante', { numerar: 500, card: 0.5, doze: 2 });
    const [e] = await jurnal('PUT /api/setari/tolerante', marca);
    expect(e.date.corp).toEqual({ numerar: 500, card: 0.5, doze: 2 });
    expect(e.date.inainte).toEqual({ numerar: 5, card: 0.5, doze: 2 });
    expect(e.stare_http).toBe(200);
    expect(e.cale).toBe('/api/setari/tolerante');
    const [{ id }] = await t.db.query<{ id: number }>(`SELECT id FROM utilizatori WHERE login = 'admin'`);
    expect(e.utilizator_id).toBe(id);
  });

  it('un produs modificat păstrează prețul și rețeta de dinainte', async () => {
    const latte = (await t.admin.get('/api/produse')).find((p: any) => p.nume === 'Latte');
    const reteta = latte.reteta.map((l: any) => ({ ...l, cantitate: l.cantitate / 2 }));
    const marca = await ultimulId();
    await t.admin.put(`/api/produse/${latte.id}`, { ...latte, pret: latte.pret + 1, reteta });
    const [e] = await jurnal('PUT /api/produse/:id', marca);
    expect(e.cale).toBe(`/api/produse/${latte.id}`);
    expect(e.date.inainte.pret).toBe(latte.pret);
    expect(e.date.inainte.reteta).toEqual([...latte.reteta].sort((a: any, b: any) => a.articol_id - b.articol_id));
    expect(e.date.corp.pret).toBe(latte.pret + 1);
  });

  it('parolele, PIN-urile și codurile nu ajung în jurnal; nici hash-urile din starea de dinainte', async () => {
    const marca = await ultimulId();
    const { id } = await t.admin.post('/api/utilizatori', { nume: 'Admin jurnal', rol: 'admin', login: 'admin-jurnal', parola: 'parola-secreta-jurnal', pin: null, locatie_id: null, activ: true });
    const [creat] = await jurnal('POST /api/utilizatori', marca);
    expect(creat.date.corp.parola).toBe('***');
    await t.admin.put(`/api/utilizatori/${id}`, { nume: 'Admin jurnal', rol: 'admin', login: 'admin-jurnal', parola: 'alta-parola-secreta', pin: null, locatie_id: null, activ: false });
    const [modificat] = await jurnal('PUT /api/utilizatori/:id', marca);
    expect(modificat.date.corp.parola).toBe('***');
    expect(modificat.date.inainte).toMatchObject({ rol: 'admin', activ: true, locatie_id: null, are_parola: true });
    expect(Object.keys(modificat.date.inainte)).not.toEqual(expect.arrayContaining(['parola_hash']));
    const text = JSON.stringify(await t.db.query('SELECT * FROM jurnal_audit'));
    expect(text).not.toContain('parola-secreta-jurnal');
    expect(text).not.toContain('alta-parola-secreta');
    expect(text).not.toMatch(/parola_hash|pin_hash|"sare"/);
  });

  it('terminalul legat de tabletă păstrează valoarea de dinainte', async () => {
    const tableta = (await t.admin.get('/api/dispozitive'))[0];
    await t.admin.put(`/api/dispozitive/${tableta.id}/terminal`, { terminal_device_id: 'PAX-1' });
    const marca = await ultimulId();
    await t.admin.put(`/api/dispozitive/${tableta.id}/terminal`, { terminal_device_id: 'PAX-STRAIN' });
    const [e] = await jurnal('PUT /api/dispozitive/:id/terminal', marca);
    expect(e.date.inainte.terminal_device_id).toBe('PAX-1');
    expect(e.date.corp.terminal_device_id).toBe('PAX-STRAIN');
    expect(JSON.stringify(e.date)).not.toContain('token');
  });

  it('operațiunile tabletei în afara cozii se scriu cu tableta; coada și citirile nu', async () => {
    await pauza(100);
    const inainte = await numar();
    await t.tableta.sync([]);
    await t.tableta.get('/api/pos/catalog');
    await t.admin.get('/api/locatii');
    await pauza(200);
    expect(await numar()).toBe(inainte);

    const marca = await ultimulId();
    await t.tableta.post('/api/pos/inventarieri', { utilizator_id: t.barista });
    const [inv] = await jurnal('POST /api/pos/inventarieri', marca);
    const [{ id: tabletaId }] = await t.db.query<{ id: number }>(`SELECT id FROM dispozitive WHERE nume = 'Tabletă Centru'`);
    expect(inv.dispozitiv_id).toBe(tabletaId);
    expect(inv.utilizator_id).toBeNull();

    // Terminalul fiscal (aici neconfigurat): și încercările refuzate rămân în jurnal, cu codul răspunsului.
    const z = await t.app.inject({ method: 'POST', url: '/api/pos/terminal/raport-z', payload: {}, headers: { authorization: `Bearer ${t.tokenTableta}` } });
    expect(z.statusCode).toBeGreaterThanOrEqual(400);
    const [ez] = await jurnal('POST /api/pos/terminal/raport-z', marca);
    expect(ez).toMatchObject({ dispozitiv_id: tabletaId, stare_http: z.statusCode });
  });

  it('asocierea unei tablete se scrie, fără cod', async () => {
    const marca = await ultimulId();
    const d = await t.admin.post('/api/dispozitive', { nume: 'Tabletă jurnal', locatie_id: t.demo.locatii.centru });
    const r = await t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: d.cod_asociere }, remoteAddress: '192.0.2.99' });
    expect(r.statusCode).toBe(200);
    const [e] = await jurnal('POST /api/pos/asociere', marca);
    expect(e).toMatchObject({ dispozitiv_id: d.id, adresa: '192.0.2.99', date: { corp: { cod: '***' } } });
    const [creare] = await jurnal('POST /api/dispozitive', marca);
    expect(creare.date.corp).toMatchObject({ nume: 'Tabletă jurnal' });
  });

  it('cererile fără autentificare nu umplu jurnalul', async () => {
    await pauza(100);
    const inainte = await numar();
    for (let i = 0; i < 5; i++) expect((await t.app.inject({ method: 'POST', url: '/api/produse', payload: {} })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: 'GRESIT99' } })).statusCode).toBe(401);
    await pauza(200);
    expect(await numar()).toBe(inainte);
  });

  it('panoul citește ultimele intrări, cu căutare', async () => {
    await pauza(100);
    const toate = await t.admin.get('/api/jurnal');
    expect(toate.length).toBeGreaterThan(5);
    expect(toate[0].id).toBeGreaterThan(toate[toate.length - 1].id);
    const tolerante = await t.admin.get('/api/jurnal?cauta=tolerante');
    expect(tolerante.length).toBeGreaterThan(0);
    expect(tolerante.every((e: any) => JSON.stringify(e).toLowerCase().includes('tolerante'))).toBe(true);
    const tableta = await t.admin.get(`/api/jurnal?cauta=${encodeURIComponent('Tabletă Centru')}`);
    expect(tableta.some((e: any) => e.dispozitiv === 'Tabletă Centru')).toBe(true);
    expect(await t.admin.get('/api/jurnal?cauta=%25_nimic_')).toEqual([]);
    expect((await t.admin.get('/api/jurnal?limita=2')).length).toBe(2);
  });

  it('dacă jurnalul nu poate fi scris, cererea reușește oricum', async () => {
    const stricat: Db = {
      ...t.db,
      query: (sql, params) => (sql.includes('INSERT INTO jurnal_audit') ? Promise.reject(new Error('disc plin')) : t.db.query(sql, params)),
    };
    const app = await construiesteApp({ db: stricat });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', parola: PAROLA_ADMIN }, remoteAddress: '192.0.2.200' });
    expect(login.statusCode).toBe(200);
    const r = await app.inject({
      method: 'PUT',
      url: '/api/setari/tolerante',
      payload: { numerar: 5, card: 0.5, doze: 2 },
      headers: { authorization: `Bearer ${login.json().token}` },
    });
    expect(r.statusCode).toBe(200);
    await app.close();
  });
});
