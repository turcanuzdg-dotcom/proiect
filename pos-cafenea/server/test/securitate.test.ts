import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evComanda, evTuraDeschisa, moment, PAROLA_ADMIN, pregateste } from './ajutor';

let t: Awaited<ReturnType<typeof pregateste>>;
beforeAll(async () => {
  t = await pregateste();
});
afterAll(async () => {
  await t.app.close();
  await t.db.close();
});

describe('acces', () => {
  it('tokenul nu mai e acceptat în URL; fluxul de notificări merge cu bilet', async () => {
    expect((await t.app.inject({ method: 'GET', url: `/api/locatii?token=${t.tokenAdmin}` })).statusCode).toBe(401);
    const bilet = (await t.admin.post('/api/flux/bilet')).bilet as string;
    expect(bilet).toMatch(/^[\w-]{20,}$/);
    expect((await t.app.inject({ method: 'GET', url: '/api/flux?bilet=gresit' })).statusCode).toBe(401);
    // Și tableta primește bilet, cu tokenul ei.
    expect((await t.tableta.post('/api/flux/bilet')).bilet).toBeTruthy();
  });

  it('după 5 parole greșite, loginul e pus în pauză', async () => {
    const incearca = () => t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', parola: 'gresita!' }, remoteAddress: '10.9.9.9' });
    for (let i = 0; i < 5; i++) expect((await incearca()).statusCode).toBe(401);
    const r = await incearca();
    expect(r.statusCode).toBe(429);
    expect(r.json().eroare).toMatch(/Prea multe încercări/);
    // Alt client nu e afectat.
    const ok = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', parola: PAROLA_ADMIN }, remoteAddress: '10.9.9.10' });
    expect(ok.statusCode).toBe(200);
  });

  it('schimbarea parolei închide celelalte sesiuni, dar o păstrează pe a celui care o schimbă', async () => {
    const alta = (await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', parola: PAROLA_ADMIN } })).json().token;
    const eu = await t.admin.get('/api/auth/eu');
    await t.admin.put(`/api/utilizatori/${eu.id}`, { nume: eu.nume, rol: 'admin', login: 'admin', parola: 'parola-test-admin-2', pin: null, locatie_id: null, activ: true });
    expect((await t.app.inject({ method: 'GET', url: '/api/locatii', headers: { authorization: `Bearer ${alta}` } })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: '/api/locatii', headers: { authorization: `Bearer ${t.tokenAdmin}` } })).statusCode).toBe(200);
    await t.admin.put(`/api/utilizatori/${eu.id}`, { nume: eu.nume, rol: 'admin', login: 'admin', parola: PAROLA_ADMIN, pin: null, locatie_id: null, activ: true });
  });

  it('un barista nu poate deveni administrator fără parolă', async () => {
    const ana = (await t.admin.get('/api/utilizatori')).find((u: any) => u.nume === 'Ana Rusu');
    expect(ana.are_parola).toBe(false);
    const r = await t.app.inject({
      method: 'PUT', url: `/api/utilizatori/${ana.id}`, headers: { authorization: `Bearer ${t.tokenAdmin}` },
      payload: { nume: ana.nume, rol: 'admin', login: 'ana', parola: null, pin: null, locatie_id: null, activ: true },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().eroare).toMatch(/parolă/);
  });

  it('tableta nu poate atribui vânzări unui barista din altă locație', async () => {
    const ion = t.catalog.baristi.find((b) => b.nume === 'Ion Ceban');
    expect(ion).toBeUndefined(); // catalogul tabletei din Centru nu-l conține
    const toti = await t.admin.get('/api/utilizatori');
    const ionId = toti.find((u: any) => u.nume === 'Ion Ceban').id;
    const tura = randomUUID();
    const r = await t.tableta.sync([evTuraDeschisa(tura, ionId)]);
    expect(r.cu_eroare).toHaveLength(1);
    expect(r.cu_eroare[0].eroare).toMatch(/nu lucrează în această locație/);
    await t.admin.post(`/api/sync/erori/${r.cu_eroare[0].id}/rezolvat`);
  });

  it('vânzările offline ale unei bariste promovate între timp la administrator se aplică', async () => {
    const { id } = await t.admin.post('/api/utilizatori', { nume: 'Barista promovată', rol: 'barista', pin: '2468', locatie_id: null, activ: true });
    // Tura și vânzarea au fost făcute offline, cu PIN-ul ei; între timp devine administrator (PIN-ul se șterge).
    const tura = randomUUID();
    const esp = t.produs('Espresso');
    const evenimente = [
      evTuraDeschisa(tura, id),
      evComanda(tura, id, [{ produs_id: esp.id, cantitate: 1, pret_unitar: esp.pret, modificatori: [] }], 'numerar', { primit: esp.pret }),
    ];
    await t.admin.put(`/api/utilizatori/${id}`, { nume: 'Barista promovată', rol: 'admin', login: 'promovata', parola: 'parola-promovatei', pin: null, locatie_id: null, activ: true });
    const r = await t.tableta.sync(evenimente);
    expect(r.cu_eroare).toEqual([]);
    expect(r.acceptate).toHaveLength(2);
  });

  it('un utilizator fără PIN de tabletă: eroarea spune asta și se repară dându-i un PIN', async () => {
    const { id } = await t.admin.post('/api/utilizatori', { nume: 'Fără PIN', rol: 'barista', pin: null, locatie_id: null, activ: true });
    const tura = randomUUID();
    const r = await t.tableta.sync([evTuraDeschisa(tura, id)]);
    expect(r.cu_eroare).toHaveLength(1);
    expect(r.cu_eroare[0].eroare).toMatch(/Fără PIN nu are PIN de tabletă/);
    await t.admin.put(`/api/utilizatori/${id}`, { nume: 'Fără PIN', rol: 'barista', pin: '1357', locatie_id: null, activ: true });
    await t.admin.post(`/api/sync/erori/${r.cu_eroare[0].id}/reaplica`);
    expect((await t.admin.get('/api/sync/erori')).some((e: any) => e.id === r.cu_eroare[0].id)).toBe(false);
  });

  it('un caracter NUL într-un câmp text nu blochează coada: evenimentul e pus deoparte', async () => {
    const tura = randomUUID();
    const esp = t.produs('Espresso');
    const ev = evComanda(tura, t.barista, [{ produs_id: esp.id, cantitate: 1, pret_unitar: esp.pret, modificatori: [] }], 'numerar');
    (ev.date as any).nota = 'cu NUL \u0000 aici';
    const r = await t.tableta.sync([evTuraDeschisa(tura, t.barista), ev]);
    expect(r.acceptate).toHaveLength(1);
    expect(r.cu_eroare.map((e: any) => e.id)).toEqual([ev.id]);
    const erori = await t.admin.get('/api/sync/erori');
    expect(erori.some((e: any) => e.id === ev.id)).toBe(true);
    await t.admin.post(`/api/sync/erori/${ev.id}/rezolvat`);
  });
});

describe('corecturi din revizie', () => {
  it('un produs creat cu „activ” debifat nu apare pe tablete', async () => {
    const cafea = t.idArticol('Cafea boabe');
    const { id } = await t.admin.post('/api/produse', { nume: 'Produs de probă', categorie_id: null, pret: 10, reteta: [{ articol_id: cafea, cantitate: 9 }], modificatori: [], activ: false });
    const catalog = await t.tableta.get('/api/pos/catalog');
    expect(catalog.produse.some((p: any) => p.id === id)).toBe(false);
    const produse = await t.admin.get('/api/produse');
    expect(produse.find((p: any) => p.id === id).activ).toBe(false);
  });

  it('alerta de stoc sub prag prinde și articolele care n-au avut nicio mișcare în locație', async () => {
    const { id } = await t.admin.post('/api/articole', { nume: 'Sirop caramel', um: 'ml', tip: 'materie_prima', prag_minim: 500 });
    const panou = await t.admin.get(`/api/panou?de_azi=${moment()}`);
    expect(panou.sub_prag.filter((x: any) => x.nume === 'Sirop caramel').length).toBe(2);
    await t.admin.put(`/api/articole/${id}`, { nume: 'Sirop caramel', um: 'ml', tip: 'materie_prima', prag_minim: 0 });
  });

  it('prima tură a unei case care avea deja bani semnalează lipsa', async () => {
    // O locație nouă, cu o alimentare din panou înainte de prima tură.
    const loc = await t.admin.post('/api/locatii', { nume: 'Cafenea Probă', tip: 'punct' });
    await t.admin.post('/api/bani/miscari', { locatie_id: loc.id, tip: 'alimentare', suma: 300, descriere: 'Fond adus de admin' });
    const tableta = await t.admin.post('/api/dispozitive', { nume: 'Tabletă Probă', locatie_id: loc.id });
    const asociere = await t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: tableta.cod_asociere } });
    const token = asociere.json().token;
    const maria = t.catalog.baristi.find((b) => b.nume === 'Maria Popa')!.id;
    const tura = randomUUID();
    // Tura se deschide după alimentare (care are data de acum).
    const r = await t.app.inject({ method: 'POST', url: '/api/pos/sync', payload: { evenimente: [evTuraDeschisa(tura, maria, 200, new Date().toISOString())] }, headers: { authorization: `Bearer ${token}` } });
    expect(r.json().cu_eroare).toEqual([]);
    const d = await t.admin.get(`/api/ture/${tura}`);
    expect(d.dif_fond).toBe(-100);
    expect(d.are_discrepante).toBe(true);
    const pierderi = await t.admin.get(`/api/rapoarte/pierderi?de=2026-01-01T00:00:00Z&pana=2027-01-01T00:00:00Z&locatie_id=${loc.id}`);
    expect(pierderi.casa.minus).toBe(-100);
  });

  it('prima tură a unei case goale nu e o discrepanță și nu afișează diferență la fond', async () => {
    const loc = await t.admin.post('/api/locatii', { nume: 'Cafenea Nouă', tip: 'punct' });
    const tableta = await t.admin.post('/api/dispozitive', { nume: 'Tabletă Nouă', locatie_id: loc.id });
    const token = (await t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: tableta.cod_asociere } })).json().token;
    const maria = t.catalog.baristi.find((b) => b.nume === 'Maria Popa')!.id;
    const tura = randomUUID();
    await t.app.inject({ method: 'POST', url: '/api/pos/sync', payload: { evenimente: [evTuraDeschisa(tura, maria, 500)] }, headers: { authorization: `Bearer ${token}` } });
    const d = await t.admin.get(`/api/ture/${tura}`);
    expect(d.dif_fond).toBeNull();
    expect(d.are_discrepante).toBe(false);
  });

  it('pierderile la inventar se raportează pe locații, fără compensare între cafenele', async () => {
    const { centru, botanica } = t.demo.locatii;
    const pahar = t.idArticol('Pahar 350 ml');
    for (const [loc, delta] of [[centru, -10], [botanica, 10]] as const) {
      const stoc = (await t.admin.get(`/api/stoc?locatie_id=${loc}`)).find((a: any) => a.articol_id === pahar).stoc;
      const inv = await t.admin.post('/api/inventarieri', { locatie_id: loc });
      await t.admin.put(`/api/inventarieri/${inv.id}/linii`, { linii: [{ articol_id: pahar, faptic: stoc + delta }] });
      await t.admin.post(`/api/inventarieri/${inv.id}/finalizeaza`);
    }
    const r = await t.admin.get(`/api/rapoarte/pierderi?de=2026-01-01T00:00:00Z&pana=2027-01-01T00:00:00Z`);
    const randuri = r.inventar.filter((x: any) => x.nume === 'Pahar 350 ml');
    expect(randuri).toHaveLength(2);
    expect(randuri.find((x: any) => x.locatie === 'Cafenea Centru').cantitate).toBe(-10);
    expect(randuri.find((x: any) => x.locatie === 'Cafenea Botanica').cantitate).toBe(10);
    expect(r.total_pierderi_cost).toBeGreaterThan(0);
  });
});
