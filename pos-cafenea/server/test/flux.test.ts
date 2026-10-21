import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evComanda, evTuraDeschisa, moment, pregateste } from './ajutor';

let t: Awaited<ReturnType<typeof pregateste>>;
beforeAll(async () => {
  t = await pregateste();
});
afterAll(async () => {
  await t.app.close();
  await t.db.close();
});

describe('vânzare și descărcare din stoc pe bază de rețetar', () => {
  it('Cappuccino cu lapte de ovăz și extra shot scade exact ingredientele', async () => {
    const { centru } = t.demo.locatii;
    const inainte = {
      cafea: await t.stoc(centru, 'Cafea boabe'),
      lapte: await t.stoc(centru, 'Lapte 3,2%'),
      ovaz: await t.stoc(centru, 'Lapte de ovăz'),
      pahar: await t.stoc(centru, 'Pahar 250 ml'),
      capac: await t.stoc(centru, 'Capac'),
      zahar: await t.stoc(centru, 'Plic zahăr'),
    };
    const tura = randomUUID();
    const cap = t.produs('Cappuccino');
    const deschidere = evTuraDeschisa(tura, t.barista);
    const ev = evComanda(tura, t.barista, [
      { produs_id: cap.id, cantitate: 2, pret_unitar: cap.pret, modificatori: [{ id: t.modificator('Lapte de ovăz').id, pret: 10 }, { id: t.modificator('Extra shot').id, pret: 10 }] },
    ], 'numerar', { primit: 200 });
    const r = await t.tableta.sync([deschidere, ev]);
    expect(r.cu_eroare).toEqual([]);
    expect(r.acceptate).toHaveLength(2);

    expect(await t.stoc(centru, 'Cafea boabe')).toBe(inainte.cafea - 2 * 27);
    expect(await t.stoc(centru, 'Lapte 3,2%')).toBe(inainte.lapte);
    expect(await t.stoc(centru, 'Lapte de ovăz')).toBe(inainte.ovaz - 300);
    expect(await t.stoc(centru, 'Pahar 250 ml')).toBe(inainte.pahar - 2);
    expect(await t.stoc(centru, 'Capac')).toBe(inainte.capac - 2);
    expect(await t.stoc(centru, 'Plic zahăr')).toBe(inainte.zahar - 2);

    const [c] = await t.admin.get(`/api/comenzi?tura_id=${tura}`);
    expect(c.total).toBe(110);
    expect(c.rest).toBe(90);
    expect(c.doze_cafea).toBe(6);
    expect(c.linii[0].cost).toBeGreaterThan(0);
  });

  it('aceeași coadă trimisă de două ori nu dublează vânzarea (offline → reconectare)', async () => {
    const tura = randomUUID();
    const esp = t.produs('Espresso');
    const coada = [evTuraDeschisa(tura, t.barista), evComanda(tura, t.barista, [{ produs_id: esp.id, cantitate: 1, pret_unitar: esp.pret, modificatori: [] }], 'card')];
    const cafea = await t.stoc(t.demo.locatii.centru, 'Cafea boabe');
    await t.tableta.sync(coada);
    const aDoua = await t.tableta.sync(coada);
    expect(aDoua.acceptate).toEqual(coada.map((e) => e.id));
    expect(await t.stoc(t.demo.locatii.centru, 'Cafea boabe')).toBe(cafea - 9);
    expect(await t.admin.get(`/api/comenzi?tura_id=${tura}`)).toHaveLength(1);
  });

  it('casarea scade ingredientele dar nu introduce bani în casă', async () => {
    const tura = randomUUID();
    const latte = t.produs('Latte');
    await t.tableta.sync([evTuraDeschisa(tura, t.barista)]);
    const lapte = await t.stoc(t.demo.locatii.centru, 'Lapte 3,2%');
    const r = await t.tableta.sync([
      evComanda(tura, t.barista, [{ produs_id: latte.id, cantitate: 1, pret_unitar: latte.pret, modificatori: [] }], 'casare', { motiv_casare: 'consum_personal' }),
    ]);
    expect(r.cu_eroare).toEqual([]);
    expect(await t.stoc(t.demo.locatii.centru, 'Lapte 3,2%')).toBe(lapte - 250);
    const bani = await t.admin.get(`/api/bani/miscari?locatie_id=${t.demo.locatii.centru}`);
    expect(bani.filter((m: any) => m.tura_id === tura && m.tip === 'incasare')).toEqual([]);
  });
});

describe('sincronizare fără blocaje', () => {
  it('un eveniment care nu poate fi aplicat ajunge la admin, iar restul cozii trece', async () => {
    const tura = randomUUID();
    const esp = t.produs('Espresso');
    const rau = evComanda(tura, t.barista, [{ produs_id: 99999, cantitate: 1, pret_unitar: 10, modificatori: [] }], 'numerar');
    const bun = evComanda(tura, t.barista, [{ produs_id: esp.id, cantitate: 1, pret_unitar: esp.pret, modificatori: [] }], 'numerar');
    const r = await t.tableta.sync([evTuraDeschisa(tura, t.barista), rau, bun]);
    expect(r.acceptate).toContain(bun.id);
    expect(r.cu_eroare.map((e: any) => e.id)).toEqual([rau.id]);

    const erori = await t.admin.get('/api/sync/erori');
    expect(erori.map((e: any) => e.id)).toContain(rau.id);
    // Tableta retrimite: evenimentul nu se dublează și nici nu blochează.
    const dinNou = await t.tableta.sync([rau]);
    expect(dinNou.acceptate).toEqual([rau.id]);
    await t.admin.post(`/api/sync/erori/${rau.id}/rezolvat`);
    expect((await t.admin.get('/api/sync/erori')).map((e: any) => e.id)).not.toContain(rau.id);
  });

  it('un eveniment cu format greșit nu oprește sincronizarea', async () => {
    const id = randomUUID();
    const r = await t.tableta.sync([{ id, tip: 'comanda', la: moment(), date: { linii: 'stricat' } }]);
    expect(r.cu_eroare[0].id).toBe(id);
    await t.admin.post(`/api/sync/erori/${id}/rezolvat`);
  });
});

describe('închiderea turei', () => {
  it('compară declarațiile baristei cu scripticul și semnalează discrepanțele', async () => {
    const tura = randomUUID();
    const cap = t.produs('Cappuccino');
    const esp = t.produs('Espresso');
    const linieCap = { produs_id: cap.id, cantitate: 1, pret_unitar: cap.pret, modificatori: [] };
    const deschidere = evTuraDeschisa(tura, t.barista, 0);
    const vanzare = evComanda(tura, t.barista, [linieCap], 'numerar', { primit: 50 });
    const deAnulat = evComanda(tura, t.barista, [{ produs_id: esp.id, cantitate: 1, pret_unitar: esp.pret, modificatori: [] }], 'card');
    await t.tableta.sync([
      deschidere,
      vanzare,
      deAnulat,
      evComanda(tura, t.barista, [linieCap], 'card'),
      evComanda(tura, t.barista, [linieCap], 'casare', { motiv_casare: 'rebut' }),
      { id: randomUUID(), tip: 'comanda_anulata', la: moment(), date: { comanda_id: deAnulat.date.comanda_id, tura_id: tura, utilizator_id: t.barista, motiv: 'greșeală', restituie_stoc: true } },
      { id: randomUUID(), tip: 'plata_marunta', la: moment(), date: { tura_id: tura, utilizator_id: t.barista, suma: 5, descriere: 'Șervețele' } },
    ]);

    const detaliu0 = await t.admin.get(`/api/ture/${tura}`);
    const sold = detaliu0.fond_initial; // fondul declarat la deschidere aliniază registrul
    // Scriptic: numerar = fond + 35 − 5; card = 35 (espresso restituit); doze = 3 cappuccino × 2; anulări 1; casări 1.
    const r = await t.tableta.sync([
      { id: randomUUID(), tip: 'tura_inchisa', la: moment(), date: { tura_id: tura, utilizator_id: t.barista, doze: 9, numerar: sold + 30 - 20, card: 35, anulari: 1, casari: 1 } },
    ]);
    expect(r.cu_eroare).toEqual([]);
    const d = await t.admin.get(`/api/ture/${tura}`);
    expect(d.scriptic_numerar).toBe(sold + 30);
    expect(d.scriptic_card).toBe(35);
    expect(d.scriptic_doze).toBe(6);
    expect(d.scriptic_anulari).toBe(1);
    expect(d.scriptic_casari).toBe(1);
    expect(d.dif_numerar).toBe(-20);
    expect(d.dif_doze).toBe(3);
    expect(d.are_discrepante).toBe(true);

    const panou = await t.admin.get(`/api/panou?de_azi=2026-01-01`);
    expect(panou.discrepante.map((x: any) => x.id)).toContain(tura);
    await t.admin.post(`/api/ture/${tura}/verifica`, { nota: 'Discutat cu barista' });
    const panou2 = await t.admin.get(`/api/panou?de_azi=2026-01-01`);
    expect(panou2.discrepante.map((x: any) => x.id)).not.toContain(tura);
  });

  it('a doua închidere a aceleiași ture e respinsă ca eroare, fără să blocheze', async () => {
    const tura = randomUUID();
    await t.tableta.sync([evTuraDeschisa(tura, t.barista, 0)]);
    const inchide = () => ({ id: randomUUID(), tip: 'tura_inchisa', la: moment(), date: { tura_id: tura, utilizator_id: t.barista, doze: 0, numerar: 0, card: 0, anulari: 0, casari: 0 } });
    expect((await t.tableta.sync([inchide()])).cu_eroare).toEqual([]);
    expect((await t.tableta.sync([inchide()])).cu_eroare).toHaveLength(1);
  });
});

describe('gestiune multi-locație', () => {
  it('recepția în depozit recalculează costul mediu, transferul mută stocul între gestiuni', async () => {
    const { depozit, botanica } = t.demo.locatii;
    const cafea = t.idArticol('Cafea boabe');
    const articol = async () => (await t.admin.get('/api/articole')).find((a: any) => a.id === cafea);
    const costVechi = (await articol()).cost_mediu;
    const stocRetea = async () => {
      const m = await t.admin.get('/api/stoc');
      const a = m.articole.find((x: any) => x.id === cafea);
      return Object.values(a.stocuri as Record<string, number>).reduce((s, x) => s + x, 0);
    };
    const totalInainte = await stocRetea();
    await t.admin.post('/api/receptii', { locatie_id: depozit, furnizor: 'Test SRL', nr_factura: 'T-1', data: '2026-10-20', linii: [{ articol_id: cafea, cantitate: 10000, cost_unitar: 0.6 }] });
    const asteptat = (totalInainte * costVechi + 10000 * 0.6) / (totalInainte + 10000);
    expect((await articol()).cost_mediu).toBeCloseTo(asteptat, 5);

    const dep = await t.stoc(depozit, 'Cafea boabe');
    const bot = await t.stoc(botanica, 'Cafea boabe');
    const r = await t.admin.post('/api/transferuri', { din_locatie_id: depozit, in_locatie_id: botanica, linii: [{ articol_id: cafea, cantitate: 2500 }] });
    expect(r.avertismente).toEqual([]);
    expect(await t.stoc(depozit, 'Cafea boabe')).toBe(dep - 2500);
    expect(await t.stoc(botanica, 'Cafea boabe')).toBe(bot + 2500);
  });

  it('transferul peste stocul sursei trece, dar cu avertisment', async () => {
    const { depozit, centru } = t.demo.locatii;
    const r = await t.admin.post('/api/transferuri', { din_locatie_id: centru, in_locatie_id: depozit, linii: [{ articol_id: t.idArticol('Croissant'), cantitate: 100000 }] });
    expect(r.avertismente).toHaveLength(1);
  });
});

describe('inventariere pe tabletă', () => {
  it('raportul Scriptic vs. Faptic e în timp real, iar finalizarea aliniază stocul', async () => {
    const { centru } = t.demo.locatii;
    const lapte = t.idArticol('Lapte 3,2%');
    const pahar = t.idArticol('Pahar 350 ml');
    const scripticLapte = await t.stoc(centru, 'Lapte 3,2%');
    const scripticPahar = await t.stoc(centru, 'Pahar 350 ml');

    const inv = await t.tableta.post('/api/pos/inventarieri', { utilizator_id: t.barista });
    let raport = await t.tableta.put(`/api/pos/inventarieri/${inv.id}/linii`, {
      linii: [{ articol_id: lapte, faptic: scripticLapte - 400 }, { articol_id: pahar, faptic: scripticPahar + 2 }],
    });
    const linie = (r: any, id: number) => r.linii.find((l: any) => l.articol_id === id);
    expect(linie(raport, lapte).diferenta).toBe(-400);
    expect(linie(raport, pahar).diferenta).toBe(2);

    // O vânzare în timpul inventarierii: articolele nenumărate o arată imediat în scriptic,
    // cele deja numărate rămân comparate cu stocul din momentul numărării.
    const capac = t.idArticol('Capac');
    const scripticCapac = linie(raport, capac).scriptic;
    await new Promise((r) => setTimeout(r, 20));
    const tura = randomUUID();
    const latte = t.produs('Latte');
    await t.tableta.sync([
      evTuraDeschisa(tura, t.barista, 0, new Date().toISOString()),
      evComanda(tura, t.barista, [{ produs_id: latte.id, cantitate: 1, pret_unitar: latte.pret, modificatori: [] }], 'card', { la: new Date().toISOString() }),
    ]);
    raport = await t.tableta.get(`/api/pos/inventarieri/${inv.id}`);
    expect(linie(raport, capac).scriptic).toBe(scripticCapac - 1);
    expect(linie(raport, lapte).scriptic).toBe(scripticLapte);
    expect(linie(raport, lapte).diferenta).toBe(-400);

    const final = await t.tableta.post(`/api/pos/inventarieri/${inv.id}/finalizeaza`);
    expect(final.stare).toBe('finalizata');
    expect(final.total_minus).toBeLessThan(0);
    expect(await t.stoc(centru, 'Lapte 3,2%')).toBe(scripticLapte - 400 - 250);
    expect(await t.stoc(centru, 'Pahar 350 ml')).toBe(scripticPahar + 2 - 1);
  });

  it('tableta nu poate citi inventarierile altei locații', async () => {
    const { id } = await t.admin.post('/api/inventarieri', { locatie_id: t.demo.locatii.botanica });
    await expect(t.tableta.get(`/api/pos/inventarieri/${id}`)).rejects.toThrow(/404/);
  });
});

describe('acces', () => {
  it('fără token nu se poate citi nimic', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/stoc' })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'POST', url: '/api/pos/sync', payload: { evenimente: [] } })).statusCode).toBe(401);
  });

  it('tokenul tabletei nu deschide panoul de administrare', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/api/stoc', headers: { authorization: `Bearer ${t.tokenTableta}` } });
    expect(r.statusCode).toBe(401);
  });

  it('codul de asociere merge o singură dată', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: t.demo.coduri_tablete.centru } });
    expect(r.statusCode).toBe(401);
  });
});
