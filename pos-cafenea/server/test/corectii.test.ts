// Cazuri găsite la revizie: evenimente care ajung pe server după ce o numărare a avut loc.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evComanda, evTuraDeschisa, pregateste } from './ajutor';

let t: Awaited<ReturnType<typeof pregateste>>;
beforeAll(async () => {
  t = await pregateste();
});
afterAll(async () => {
  await t.app.close();
  await t.db.close();
});

const ora = (h: number, m = 0) => `2026-10-19T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;

describe('inventariere și vânzări sincronizate târziu', () => {
  it('o vânzare offline ajunsă după finalizarea numărării nu se scade de două ori', async () => {
    const { centru } = t.demo.locatii;
    const lapte = t.idArticol('Lapte 3,2%');
    const scriptic = await t.stoc(centru, 'Lapte 3,2%');
    // Tableta a vândut un Latte (250 ml) offline, dar vânzarea încă n-a ajuns pe server.
    // Barista numără laptele: fizic lipsesc 250 ml față de scriptic.
    const inv = await t.admin.post('/api/inventarieri', { locatie_id: centru });
    await t.admin.put(`/api/inventarieri/${inv.id}/linii`, { linii: [{ articol_id: lapte, faptic: scriptic - 250 }] });
    let raport = await t.admin.post(`/api/inventarieri/${inv.id}/finalizeaza`);
    expect(raport.linii[0].diferenta).toBe(-250);
    expect(await t.stoc(centru, 'Lapte 3,2%')).toBe(scriptic - 250);

    // Acum ajunge vânzarea, datată înaintea numărării.
    const tura = randomUUID();
    const latte = t.produs('Latte');
    const r = await t.tableta.sync([
      evTuraDeschisa(tura, t.barista, 0, ora(7)),
      evComanda(tura, t.barista, [{ produs_id: latte.id, cantitate: 1, pret_unitar: latte.pret, modificatori: [] }], 'card', { la: ora(8) }),
    ]);
    expect(r.cu_eroare).toEqual([]);
    // Stocul rămâne cel numărat: vânzarea era deja cuprinsă în numărare.
    expect(await t.stoc(centru, 'Lapte 3,2%')).toBe(scriptic - 250);
    // Raportul finalizat nu mai arată o lipsă care nu există.
    raport = await t.admin.get(`/api/inventarieri/${inv.id}`);
    expect(raport.linii.find((l: any) => l.articol_id === lapte).diferenta).toBe(0);
    expect(raport.total_minus).toBe(0);
    // Vânzarea rămâne în rapoartele de vânzări la data ei.
    const vanzari = await t.admin.get(`/api/rapoarte/vanzari?de=${ora(0)}&pana=${ora(23)}`);
    expect(vanzari.randuri.find((x: any) => x.nume === 'Latte').cantitate).toBe(1);
  });

  it('retrimiterea aceleiași cantități numărate nu mută momentul numărării', async () => {
    const { botanica } = t.demo.locatii;
    const pahar = t.idArticol('Pahar 250 ml');
    const inv = await t.admin.post('/api/inventarieri', { locatie_id: botanica });
    const r1 = await t.admin.put(`/api/inventarieri/${inv.id}/linii`, { linii: [{ articol_id: pahar, faptic: 100 }] });
    await new Promise((r) => setTimeout(r, 15));
    const r2 = await t.admin.put(`/api/inventarieri/${inv.id}/linii`, { linii: [{ articol_id: pahar, faptic: 100 }] });
    const linie = (r: any) => r.linii.find((l: any) => l.articol_id === pahar);
    expect(linie(r2).numarat_la).toBe(linie(r1).numarat_la);
    const r3 = await t.admin.put(`/api/inventarieri/${inv.id}/linii`, { linii: [{ articol_id: pahar, faptic: 101 }] });
    expect(linie(r3).numarat_la).not.toBe(linie(r1).numarat_la);
    await t.admin.post(`/api/inventarieri/${inv.id}/finalizeaza`);
  });

  it('pe o locație există o singură inventariere deschisă, oricine ar porni-o', async () => {
    const { centru } = t.demo.locatii;
    const [a, b, c] = await Promise.all([
      t.admin.post('/api/inventarieri', { locatie_id: centru }),
      t.tableta.post('/api/pos/inventarieri', { utilizator_id: t.barista }),
      t.admin.post('/api/inventarieri', { locatie_id: centru }),
    ]);
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
    const deschise = (await t.admin.get(`/api/inventarieri?locatie_id=${centru}`)).filter((i: any) => i.stare === 'deschisa');
    expect(deschise).toHaveLength(1);
  });

  it('un articol dezactivat cu stoc rămâne vizibil în stocuri', async () => {
    const { centru } = t.demo.locatii;
    const articole = await t.admin.get('/api/articole');
    const zahar = articole.find((a: any) => a.nume === 'Plic zahăr');
    await t.admin.put(`/api/articole/${zahar.id}`, { nume: zahar.nume, um: zahar.um, tip: zahar.tip, prag_minim: zahar.prag_minim, activ: false });
    const stoc = await t.admin.get(`/api/stoc?locatie_id=${centru}`);
    const rand = stoc.find((a: any) => a.articol_id === zahar.id);
    expect(rand).toBeTruthy();
    expect(rand.activ).toBe(false);
    expect(rand.sub_prag).toBe(false);
    const matrice = await t.admin.get('/api/stoc');
    expect(matrice.articole.some((a: any) => a.id === zahar.id)).toBe(true);
    await t.admin.put(`/api/articole/${zahar.id}`, { nume: zahar.nume, um: zahar.um, tip: zahar.tip, prag_minim: zahar.prag_minim, activ: true });
  });
});

describe('bani sincronizați după închiderea turei', () => {
  it('o vânzare în numerar ajunsă după închidere corectează tura închisă, nu pe următoarea', async () => {
    const { botanica } = t.demo.locatii;
    const asociere = await t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: t.demo.coduri_tablete.botanica } });
    const token = asociere.json().token as string;
    const sync = async (evenimente: unknown[]) => {
      const r = await t.app.inject({ method: 'POST', url: '/api/pos/sync', payload: { evenimente }, headers: { authorization: `Bearer ${token}` } });
      return r.json();
    };
    const barista = t.catalog.baristi.find((b) => b.nume === 'Maria Popa')!.id;
    const cap = t.produs('Cappuccino');
    const esp = t.produs('Espresso');
    const turaA = randomUUID();
    const vanzareTarzie = evComanda(turaA, barista, [{ produs_id: esp.id, cantitate: 1, pret_unitar: esp.pret, modificatori: [] }], 'numerar', { primit: 25, la: ora(9) });

    // Tura A: fond 0, un cappuccino (35 lei) sincronizat, un espresso (25 lei) rămas pe tabletă.
    // Barista numără corect 60 lei, dar serverul știe doar de 35: tura e marcată cu plus 25.
    let r = await sync([
      evTuraDeschisa(turaA, barista, 0, ora(7)),
      evComanda(turaA, barista, [{ produs_id: cap.id, cantitate: 1, pret_unitar: cap.pret, modificatori: [] }], 'numerar', { primit: 50, la: ora(8) }),
      { id: randomUUID(), tip: 'tura_inchisa', la: ora(20), date: { tura_id: turaA, utilizator_id: barista, doze: 3, numerar: 60, card: 0, anulari: 0, casari: 0 } },
    ]);
    expect(r.cu_eroare).toEqual([]);
    let a = await t.admin.get(`/api/ture/${turaA}`);
    expect(a.dif_numerar).toBe(25);
    expect(a.dif_doze).toBe(1);
    expect(a.are_discrepante).toBe(true);

    // Vânzarea întârziată ajunge a doua zi: tura A devine corectă.
    r = await sync([vanzareTarzie]);
    expect(r.cu_eroare).toEqual([]);
    a = await t.admin.get(`/api/ture/${turaA}`);
    expect(a.scriptic_numerar).toBe(60);
    expect(a.dif_numerar).toBe(0);
    expect(a.scriptic_doze).toBe(3);
    expect(a.are_discrepante).toBe(false);

    // Tura B pornește de la cei 60 de lei numărați: nicio discrepanță falsă.
    const turaB = randomUUID();
    r = await sync([evTuraDeschisa(turaB, barista, 60, ora(21))]);
    expect(r.cu_eroare).toEqual([]);
    const b = await t.admin.get(`/api/ture/${turaB}`);
    expect(b.dif_fond).toBe(0);
    expect(b.are_discrepante).toBe(false);
    // Registrul de numerar al locației arată banii reali.
    const rezumat = await t.admin.get(`/api/bani/rezumat?de=${ora(0)}&pana=${ora(23)}`);
    expect(rezumat.find((x: any) => x.locatie_id === botanica).sold_numerar).toBe(60);
  });
});
