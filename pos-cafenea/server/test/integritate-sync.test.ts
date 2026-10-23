// Integritatea cozii de sincronizare: totaluri și modificatori verificați, prețuri diferite de catalog
// semnalate, ora tabletei (limite și ceas dat înapoi), deschideri de tură repetate sau reaplicate,
// erori mari, versiunea catalogului per tabletă.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LinieComanda } from '@cafenea/shared';
import { folosesteClientPOSLink } from '../src/servicii/terminal';
import { reevalueazaDiscrepante } from '../src/servicii/ture';
import { evComanda, evTuraDeschisa, pregateste, tableteVechi } from './ajutor';

let t: Awaited<ReturnType<typeof pregateste>>;
beforeAll(async () => {
  t = await pregateste();
});
afterAll(async () => {
  await t.app.close();
  await t.db.close();
});

const zi = (d: number, h: number, m = 0) => `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;

/** O cafenea nouă, cu tableta ei (asociată „de la începutul lunii”), ca registrul de bani să pornească de la zero. */
async function cafeneaNoua(nume: string) {
  const loc = await t.admin.post('/api/locatii', { nume, tip: 'punct' });
  const tableta = await t.admin.post('/api/dispozitive', { nume: `Tabletă ${nume}`, locatie_id: loc.id });
  await tableteVechi(t.db);
  const token = (await t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: tableta.cod_asociere } })).json().token as string;
  const sync = async (evenimente: unknown[]) => {
    const r = await t.app.inject({ method: 'POST', url: '/api/pos/sync', payload: { evenimente }, headers: { authorization: `Bearer ${token}` } });
    expect(r.statusCode).toBe(200);
    return r.json();
  };
  const barista = async (n: string, pin: string) =>
    (await t.admin.post('/api/utilizatori', { nume: `${n} ${nume}`, rol: 'barista', pin, locatie_id: loc.id, activ: true })).id as number;
  const unu = await barista('Ioana', '1111');
  const doi = await barista('Vera', '2222');
  const soldNumerar = async () =>
    (await t.db.query<{ s: number }>(`SELECT COALESCE(SUM(suma), 0)::numeric AS s FROM miscari_bani WHERE locatie_id = $1 AND cont = 'numerar'`, [loc.id]))[0].s;
  return { loc, tableta, token, sync, soldNumerar, unu, doi };
}

const inchidere = (tura: string, utilizator: number, numerar: number, la: string, doze = 0) => ({
  id: randomUUID(), tip: 'tura_inchisa', la, date: { tura_id: tura, utilizator_id: utilizator, doze, numerar, card: 0, anulari: 0, casari: 0 },
});

describe('comanda: total, prețuri, modificatori', () => {
  it('un total care nu corespunde liniilor ajunge la erori, iar restul cozii merge mai departe', async () => {
    const tura = randomUUID();
    const latte = t.produs('Latte');
    const linii: LinieComanda[] = [{ produs_id: latte.id, cantitate: 10, pret_unitar: latte.pret, modificatori: [] }];
    const alterata = evComanda(tura, t.barista, linii, 'numerar');
    alterata.date.total = 0.01;
    const buna = evComanda(tura, t.barista, linii, 'card');
    const r = await t.tableta.sync([evTuraDeschisa(tura, t.barista), alterata, buna]);
    expect(r.cu_eroare).toEqual([{ id: alterata.id, eroare: expect.stringMatching(/Totalul comenzii \(0\.01\) nu corespunde liniilor/) }]);
    expect(r.acceptate).toContain(buna.id);
    expect(await t.db.query('SELECT 1 FROM comenzi WHERE id = $1', [alterata.date.comanda_id])).toHaveLength(0);
    // Casarea nu are încasare: totalul ei nu contează.
    const casare = evComanda(tura, t.barista, linii, 'casare', { motiv_casare: 'rebut' });
    casare.date.total = 0;
    expect((await t.tableta.sync([casare])).acceptate).toEqual([casare.id]);
  });

  it('un preț diferit de catalog se acceptă (vânzare offline), dar comanda e marcată și numărată pe panou', async () => {
    const tura = randomUUID();
    const latte = t.produs('Latte');
    const mod = t.catalog.modificatori.find((m) => latte.modificatori.includes(m.id) && m.pret > 0)!;
    const laCatalog = evComanda(tura, t.barista, [{ produs_id: latte.id, cantitate: 1, pret_unitar: latte.pret, modificatori: [{ id: mod.id, pret: mod.pret }] }], 'card');
    const pretVechi = evComanda(
      tura, t.barista,
      [{ produs_id: latte.id, cantitate: 2, pret_unitar: latte.pret - 5, modificatori: [{ id: mod.id, pret: mod.pret + 1 }] }],
      'numerar', { primit: 200 },
    );
    const panouInainte = await t.admin.get('/api/panou?de_azi=2026-01-01');
    const r = await t.tableta.sync([evTuraDeschisa(tura, t.barista, 500, new Date(Date.now() - 3_600_000).toISOString()), { ...laCatalog, la: new Date().toISOString() }, { ...pretVechi, la: new Date().toISOString() }]);
    expect(r.cu_eroare).toEqual([]);

    const [c1] = await t.db.query<any>('SELECT pret_abatere FROM comenzi WHERE id = $1', [laCatalog.date.comanda_id]);
    expect(c1.pret_abatere).toBe(false);
    const [c2] = await t.db.query<any>('SELECT pret_abatere, total FROM comenzi WHERE id = $1', [pretVechi.date.comanda_id]);
    expect(c2).toEqual({ pret_abatere: true, total: 2 * (latte.pret - 5 + mod.pret + 1) });
    const [l2] = await t.db.query<any>('SELECT pret_unitar, pret_catalog, modificatori FROM comenzi_linii WHERE comanda_id = $1', [pretVechi.date.comanda_id]);
    expect(l2.pret_unitar).toBe(latte.pret - 5);
    expect(l2.pret_catalog).toBe(latte.pret);
    expect(l2.modificatori).toEqual([{ id: mod.id, nume: mod.nume, pret: mod.pret + 1, pret_catalog: mod.pret }]);

    const panou = await t.admin.get('/api/panou?de_azi=2026-01-01');
    expect(panou.preturi_abatute).toBe(panouInainte.preturi_abatute + 1);
    const filtrate = await t.admin.get('/api/comenzi?pret_abatere=true&limita=1000');
    expect(filtrate.map((c: any) => c.id)).toContain(pretVechi.date.comanda_id);
    expect(filtrate.every((c: any) => c.pret_abatere)).toBe(true);
  });

  it('un modificator repetat pe linie sau nepermis pentru produs ajunge la erori', async () => {
    const tura = randomUUID();
    const produs = t.catalog.produse.find((p) => p.modificatori.length > 0)!;
    const permis = t.catalog.modificatori.find((m) => produs.modificatori.includes(m.id))!;
    const nepermis = t.catalog.modificatori.find((m) => !produs.modificatori.includes(m.id))!;
    const linie = (mods: { id: number; pret: number }[]): LinieComanda[] => [{ produs_id: produs.id, cantitate: 1, pret_unitar: produs.pret, modificatori: mods }];
    const repetat = evComanda(tura, t.barista, linie([permis, permis].map((m) => ({ id: m.id, pret: 0 }))), 'card');
    const strain = evComanda(tura, t.barista, linie([{ id: nepermis.id, pret: nepermis.pret }]), 'card');
    const r = await t.tableta.sync([evTuraDeschisa(tura, t.barista), repetat, strain]);
    expect(r.acceptate).toHaveLength(1);
    expect(r.cu_eroare).toEqual([
      { id: repetat.id, eroare: expect.stringMatching(/Modificator repetat pe aceeași linie/) },
      { id: strain.id, eroare: expect.stringMatching(/nu este permis pentru/) },
    ]);
    // Adminul leagă modificatorul de produs și reaplică: acum trece.
    const produse = await t.admin.get('/api/produse');
    const p = produse.find((x: any) => x.id === produs.id);
    await t.admin.put(`/api/produse/${produs.id}`, { ...p, modificatori: [...p.modificatori, nepermis.id] });
    await t.admin.post(`/api/sync/erori/${strain.id}/reaplica`);
    expect(await t.db.query('SELECT 1 FROM comenzi WHERE id = $1', [strain.date.comanda_id])).toHaveLength(1);
    await t.admin.post(`/api/sync/erori/${repetat.id}/rezolvat`);
  });
});

describe('ora tabletei', () => {
  it('răspunsul sincronizării are ora serverului', async () => {
    const r = await t.tableta.sync([]);
    expect(Math.abs(Date.parse(r.ora_server) - Date.now())).toBeLessThan(5_000);
  });

  it('un moment cu peste 10 minute în viitor sau dinaintea asocierii ajunge la erori; adminul îl poate reaplica', async () => {
    const tura = randomUUID();
    const viitor = evTuraDeschisa(tura, t.barista, 500, new Date(Date.now() + 20 * 60_000).toISOString());
    const tura2 = randomUUID();
    const vechi = evTuraDeschisa(tura2, t.barista, 500, '1970-01-02T08:00:00Z');
    const bun = evTuraDeschisa(randomUUID(), t.barista, 500, new Date(Date.now() + 2 * 60_000).toISOString());
    const r = await t.tableta.sync([viitor, vechi, bun]);
    expect(r.cu_eroare).toEqual([
      { id: viitor.id, eroare: 'Ceasul tabletei este înaintea serverului; verificați „Data și ora automate”' },
      { id: vechi.id, eroare: expect.stringMatching(/^Ora tabletei pare greșită/) },
    ]);
    expect(r.acceptate).toEqual([bun.id]);
    // Decizia adminului: reaplicarea nu mai trece prin limitele de oră.
    await t.admin.post(`/api/sync/erori/${viitor.id}/reaplica`);
    expect(await t.db.query('SELECT 1 FROM ture WHERE id = $1', [tura])).toHaveLength(1);
    await t.admin.post(`/api/sync/erori/${vechi.id}/rezolvat`);
  });

  it('un ceas dat înapoi nu mută banii în tura închisă a altei bariste; evenimentul e semnalat', async () => {
    const c = await cafeneaNoua('Cafenea Ceas');
    const maria = c.unu;
    const ana = c.doi;
    const esp = t.produs('Espresso');
    const s1 = randomUUID();
    const s2 = randomUUID();
    let r = await c.sync([evTuraDeschisa(s1, maria, 500, zi(19, 7)), inchidere(s1, maria, 500, zi(19, 15))]);
    expect(r.cu_eroare).toEqual([]);
    const panouInainte = await t.admin.get('/api/panou?de_azi=2026-01-01');
    // Ana deschide S2, apoi dă ceasul tabletei înapoi, în tura Mariei, și vinde un espresso pe S2.
    const vanzare = evComanda(s2, ana, [{ produs_id: esp.id, cantitate: 1, pret_unitar: esp.pret, modificatori: [] }], 'numerar', { primit: esp.pret, la: zi(19, 10) });
    r = await c.sync([evTuraDeschisa(s2, ana, 500, zi(19, 16)), vanzare, inchidere(s2, ana, 500, zi(19, 22))]);
    expect(r.cu_eroare).toEqual([]);

    const tura1 = await t.admin.get(`/api/ture/${s1}`);
    expect(tura1.are_discrepante).toBe(false);
    expect(tura1.scriptic_numerar).toBe(500);
    const tura2 = await t.admin.get(`/api/ture/${s2}`);
    // Banii lipsesc din sertarul Anei, deci lipsa e pe tura ei.
    expect(tura2.dif_numerar).toBe(-esp.pret);
    expect(tura2.are_discrepante).toBe(true);
    const [mb] = await t.db.query<any>(`SELECT creata_la FROM miscari_bani WHERE document_id = $1 AND tip = 'incasare'`, [vanzare.date.comanda_id]);
    expect(new Date(mb.creata_la).toISOString()).toBe(zi(19, 16));
    // Comanda păstrează ora trimisă; evenimentul e marcat cu oră suspectă.
    const [cmd] = await t.db.query<any>('SELECT creata_la FROM comenzi WHERE id = $1', [vanzare.date.comanda_id]);
    expect(new Date(cmd.creata_la).toISOString()).toBe(zi(19, 10));
    const [ev] = await t.db.query<any>('SELECT ora_suspecta FROM evenimente_sync WHERE id = $1', [vanzare.id]);
    expect(ev.ora_suspecta).toBe(true);
    const panou = await t.admin.get('/api/panou?de_azi=2026-01-01');
    expect(panou.ore_suspecte).toBe(panouInainte.ore_suspecte + 1);
    // Panoul spune tableta; lista arată operațiunea și tura ei, ca adminul s-o verifice.
    expect(panou.ore_suspecte_tablete).toContainEqual({ dispozitiv: 'Tabletă Cafenea Ceas', locatie: 'Cafenea Ceas', n: 1 });
    const suspecte = await t.admin.get('/api/sync/ore-suspecte');
    expect(suspecte.find((x: any) => x.id === vanzare.id)).toMatchObject({
      tip: 'comanda', dispozitiv: 'Tabletă Cafenea Ceas', locatie: 'Cafenea Ceas', tura_id: s2, barista: 'Vera Cafenea Ceas',
    });
    expect(new Date(suspecte.find((x: any) => x.id === vanzare.id).la).toISOString()).toBe(zi(19, 10));
    expect(await c.soldNumerar()).toBe(500);
  });
});

describe('deschiderea turei', () => {
  it('o a doua deschidere a unei ture deja deschise (și verificate) e respinsă și nu schimbă nimic', async () => {
    const c = await cafeneaNoua('Cafenea Dublă');
    const tura = randomUUID();
    expect((await c.sync([evTuraDeschisa(tura, c.unu, 500, zi(18, 7)), inchidere(tura, c.unu, 500, zi(18, 20))])).cu_eroare).toEqual([]);
    await t.admin.post(`/api/ture/${tura}/verifica`, { nota: 'ok' });
    const inainte = await t.admin.get(`/api/ture/${tura}`);
    const r = await c.sync([evTuraDeschisa(tura, c.unu, 200, zi(18, 8))]);
    expect(r.cu_eroare).toEqual([{ id: expect.any(String), eroare: 'Tura este deja deschisă' }]);
    const dupa = await t.admin.get(`/api/ture/${tura}`);
    expect(dupa.fond_initial).toBe(inainte.fond_initial);
    expect(await c.soldNumerar()).toBe(500);
    await t.admin.post(`/api/sync/erori/${r.cu_eroare[0].id}/rezolvat`);
  });

  it('reaplicată în ordinea inversă, deschiderea nu numără diferența de casă de două ori', async () => {
    const c = await cafeneaNoua('Cafenea Reaplicare');
    const maria = c.unu;
    const s0 = randomUUID();
    await c.sync([evTuraDeschisa(s0, maria, 500, zi(18, 7)), inchidere(s0, maria, 500, zi(18, 20))]);
    expect(await c.soldNumerar()).toBe(500);

    // Adminul a mutat-o din greșeală pe Elena la altă cafenea: toată tura ei e respinsă.
    const { id: elena } = await t.admin.post('/api/utilizatori', { nume: 'Elena Mutată', rol: 'barista', pin: '2468', locatie_id: t.demo.locatii.botanica, activ: true });
    const s1 = randomUUID();
    const latte = t.produs('Latte');
    const evs = [
      evTuraDeschisa(s1, elena, 450, zi(19, 7)), // în sertar erau 450, registrul spunea 500
      evComanda(s1, elena, [{ produs_id: latte.id, cantitate: 1, pret_unitar: latte.pret, modificatori: [] }], 'numerar', { primit: latte.pret, la: zi(19, 9) }),
      inchidere(s1, elena, 450 + latte.pret, zi(19, 20), 1),
    ];
    const r = await c.sync(evs);
    expect(r.cu_eroare).toHaveLength(3);

    // Lista erorilor e în ordinea de pe tabletă.
    const lista = (await t.admin.get('/api/sync/erori')).filter((e: any) => evs.some((x) => x.id === e.id));
    expect(lista.map((e: any) => e.id)).toEqual(evs.map((e) => e.id));
    expect(lista[0].payload).toBeUndefined();

    // Adminul corectează locația și reaplică de jos în sus (cea mai nouă întâi).
    await t.admin.put(`/api/utilizatori/${elena}`, { nume: 'Elena Mutată', rol: 'barista', pin: '2468', locatie_id: c.loc.id, activ: true });
    for (const e of [...evs].reverse()) await t.admin.post(`/api/sync/erori/${e.id}/reaplica`);

    expect(await c.soldNumerar()).toBe(450 + latte.pret);
    const tura = await t.admin.get(`/api/ture/${s1}`);
    expect(tura.dif_fond).toBe(-50);
    expect(tura.dif_numerar).toBe(0);
    expect(tura.creata_automat).toBe(false);
  });

  it('o tură verificată ale cărei cifre se schimbă după verificare iese din nou la verificare', async () => {
    const c = await cafeneaNoua('Cafenea Verificată');
    const tura = randomUUID();
    const esp = t.produs('Espresso');
    expect((await c.sync([evTuraDeschisa(tura, c.unu, 500, zi(17, 7)), inchidere(tura, c.unu, 480, zi(17, 20))])).cu_eroare).toEqual([]);
    await t.admin.post(`/api/ture/${tura}/verifica`, { nota: 'lipsă discutată' });
    const neverificate = async () => (await t.admin.get('/api/ture?neverificate=true')).some((x: any) => x.id === tura);
    expect(await neverificate()).toBe(false);

    // Vânzare offline din acea tură, ajunsă după verificare: cifrele turei se schimbă.
    await c.sync([evComanda(tura, c.unu, [{ produs_id: esp.id, cantitate: 1, pret_unitar: esp.pret, modificatori: [] }], 'numerar', { primit: esp.pret, la: zi(17, 12) })]);
    const d = await t.admin.get(`/api/ture/${tura}`);
    expect(d.modificata_dupa_verif).toBe(true);
    expect(await neverificate()).toBe(true);
    const panou = await t.admin.get('/api/panou?de_azi=2026-01-01');
    expect(panou.discrepante.find((x: any) => x.id === tura)?.modificata_dupa_verif).toBe(true);

    await t.admin.post(`/api/ture/${tura}/verifica`, { nota: 'reverificat' });
    expect(await neverificate()).toBe(false);
    expect((await t.admin.get(`/api/ture/${tura}`)).modificata_dupa_verif).toBe(false);
  });

  it('o modificare dintr-o tranzacție începută înaintea verificării iese totuși la verificare', async () => {
    const c = await cafeneaNoua('Cafenea Cursă Verificare');
    const tura = randomUUID();
    expect((await c.sync([evTuraDeschisa(tura, c.unu, 500, zi(16, 7)), inchidere(tura, c.unu, 480, zi(16, 20))])).cu_eroare).toEqual([]);
    // Tranzacția sincronizării a început (now() fixat), apoi verificarea adminului s-a validat, apoi
    // UPDATE-ul ei vede verificata_la: momentul modificării trebuie să fie după verificare.
    await t.db.tx(async (tx) => {
      await tx.query('SELECT now()');
      await tx.query(`UPDATE ture SET verificata_la = now() + interval '1 minute' WHERE id = $1`, [tura]);
      await reevalueazaDiscrepante(tx, tura);
    });
    expect((await t.admin.get(`/api/ture/${tura}`)).modificata_dupa_verif).toBe(true);
  });

  it('deschiderea reaplicată a unei ture create automat și deja verificate o scoate din nou la verificare', async () => {
    const c = await cafeneaNoua('Cafenea Automată');
    const tura = randomUUID();
    const esp = t.produs('Espresso');
    // Deschiderea vine cu ceasul înainte și e respinsă; vânzarea și închiderea creează tura automat.
    const deschidere = evTuraDeschisa(tura, c.unu, 450, zi(15, 7));
    const r = await c.sync([
      { ...deschidere, la: new Date(Date.now() + 60 * 60_000).toISOString() },
      evComanda(tura, c.unu, [{ produs_id: esp.id, cantitate: 1, pret_unitar: esp.pret, modificatori: [] }], 'numerar', { primit: esp.pret, la: zi(15, 9) }),
      inchidere(tura, c.unu, 450 + esp.pret, zi(15, 20), 1),
    ]);
    expect(r.cu_eroare).toHaveLength(1);
    expect((await t.admin.get(`/api/ture/${tura}`)).creata_automat).toBe(true);
    await t.admin.post(`/api/ture/${tura}/verifica`, { nota: 'văzut' });
    expect((await t.admin.get(`/api/ture/${tura}`)).modificata_dupa_verif).toBeFalsy();

    await t.admin.post(`/api/sync/erori/${deschidere.id}/reaplica`);
    const dupa = await t.admin.get(`/api/ture/${tura}`);
    expect(dupa.creata_automat).toBe(false);
    expect(dupa.fond_initial).toBe(450);
    expect(dupa.modificata_dupa_verif).toBe(true);
    expect((await t.admin.get('/api/ture?neverificate=true')).some((x: any) => x.id === tura)).toBe(true);
  });
});

describe('lista erorilor de sincronizare', () => {
  it('fiecare rând spune câte erori nerezolvate sunt în total, ca pagina să arate că lista e trunchiată', async () => {
    const evs = Array.from({ length: 3 }, () => ({ id: randomUUID(), tip: 'comanda', la: new Date().toISOString(), date: { stricat: true } }));
    expect((await t.tableta.sync(evs)).cu_eroare).toHaveLength(3);
    const lista = await t.admin.get('/api/sync/erori');
    const [{ n }] = await t.db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM evenimente_sync WHERE stare = 'eroare'`);
    expect(n).toBeGreaterThanOrEqual(3);
    expect(lista.every((e: any) => e.total === n)).toBe(true);
    for (const e of evs) await t.admin.post(`/api/sync/erori/${e.id}/rezolvat`);
  });

  it('peste limită, lista arată cele mai vechi erori și totalul real', async () => {
    const { LIMITA_LISTA_ERORI } = await import('../src/servicii/sync');
    const evs = Array.from({ length: LIMITA_LISTA_ERORI + 5 }, () => ({ id: randomUUID(), tip: 'comanda', la: new Date().toISOString(), date: { stricat: true } }));
    expect((await t.tableta.sync(evs)).cu_eroare).toHaveLength(evs.length);
    const lista = await t.admin.get('/api/sync/erori');
    expect(lista).toHaveLength(LIMITA_LISTA_ERORI);
    expect(lista[0].total).toBeGreaterThanOrEqual(evs.length);
    await t.db.query(`UPDATE evenimente_sync SET stare = 'rezolvat' WHERE id = ANY($1::uuid[])`, [evs.map((e) => e.id)]);
  });
});

describe('erori de sincronizare mari', () => {
  it('un eveniment invalid de peste 64 KB se păstrează doar ca fișă; lista nu aduce conținutul', async () => {
    const id = randomUUID();
    const r = await t.tableta.sync([{ id, tip: 'comanda', la: new Date().toISOString(), date: { gunoi: 'x'.repeat(200_000) } }]);
    expect(r.cu_eroare).toHaveLength(1);
    const [e] = await t.db.query<any>('SELECT payload FROM evenimente_sync WHERE id = $1', [id]);
    expect(e.payload).toEqual({ id, tip: 'comanda', trunchiat: true, octeti: expect.any(Number) });
    expect(e.payload.octeti).toBeGreaterThan(200_000);
    const lista = await t.admin.get('/api/sync/erori');
    expect(lista.find((x: any) => x.id === id)).toMatchObject({ trunchiat: true });
    const detaliu = await t.admin.get(`/api/sync/erori/${id}`);
    expect(detaliu.payload.trunchiat).toBe(true);
    await expect(t.admin.post(`/api/sync/erori/${id}/reaplica`)).rejects.toThrow(/format invalid/);
    await t.admin.post(`/api/sync/erori/${id}/rezolvat`);

    // Unul mic se păstrează întreg.
    const mic = randomUUID();
    await t.tableta.sync([{ id: mic, tip: 'comanda', la: new Date().toISOString(), date: { stricat: true } }]);
    expect((await t.admin.get(`/api/sync/erori/${mic}`)).payload.date).toEqual({ stricat: true });
    await t.admin.post(`/api/sync/erori/${mic}/rezolvat`);
  });
});

/** Tableta de test (Centru): cea asociată în pregateste. */
const idTableta = async () =>
  (await t.db.query<{ id: number }>('SELECT id FROM dispozitive WHERE locatie_id = $1 AND token IS NOT NULL ORDER BY id LIMIT 1', [t.demo.locatii.centru]))[0].id;

describe('catalogul tabletei și semnul de viață', () => {
  it('legarea unui terminal schimbă versiunea catalogului din sincronizare', async () => {
    folosesteClientPOSLink({} as any); // POSLink „configurat” pentru acest test
    const tableta = await idTableta();
    try {
      const inainte = await t.tableta.sync([]);
      const catalog = await t.tableta.get('/api/pos/catalog');
      expect(catalog.versiune).toBe(inainte.catalog_versiune);
      expect(catalog.terminal_prin_server).toBe(false);

      await t.admin.put(`/api/dispozitive/${tableta}/terminal`, { terminal_device_id: 'PAX-TEST-1' });
      const dupa = await t.tableta.sync([]);
      expect(dupa.catalog_versiune).not.toBe(inainte.catalog_versiune);
      const catalogNou = await t.tableta.get('/api/pos/catalog');
      expect(catalogNou.terminal_prin_server).toBe(true);
      expect(catalogNou.versiune).toBe(dupa.catalog_versiune);
    } finally {
      await t.admin.put(`/api/dispozitive/${tableta}/terminal`, { terminal_device_id: null });
      folosesteClientPOSLink(null);
    }
  });

  it('redenumirea locației anunță tabletele să-și reîncarce catalogul', async () => {
    const { magistrala } = await import('../src/magistrala');
    const primite: string[] = [];
    const asculta = (n: { tip: string }) => primite.push(n.tip);
    magistrala.on('notificare', asculta);
    try {
      const loc = (await t.admin.get('/api/locatii')).find((l: any) => l.id === t.demo.locatii.centru);
      const inainte = (await t.tableta.sync([])).catalog_versiune;
      await t.admin.put(`/api/locatii/${loc.id}`, { ...loc, nume: `${loc.nume} (nou)` });
      expect(primite).toContain('catalog');
      expect((await t.tableta.sync([])).catalog_versiune).not.toBe(inainte);
      await t.admin.put(`/api/locatii/${loc.id}`, loc);
    } finally {
      magistrala.off('notificare', asculta);
    }
  });

  it('semnul de viață se scrie cel mult o dată pe minut', async () => {
    const id = await idTableta();
    await t.db.query(`UPDATE dispozitive SET ultima_sincronizare = now() - interval '30 seconds' WHERE id = $1`, [id]);
    const citeste = async () => new Date((await t.db.query<any>('SELECT ultima_sincronizare FROM dispozitive WHERE id = $1', [id]))[0].ultima_sincronizare).getTime();
    const inainte = await citeste();
    await t.tableta.sync([]);
    expect(await citeste()).toBe(inainte);
    await t.db.query(`UPDATE dispozitive SET ultima_sincronizare = now() - interval '2 minutes' WHERE id = $1`, [id]);
    await t.tableta.sync([]);
    expect(Date.now() - (await citeste())).toBeLessThan(10_000);
  });
});
