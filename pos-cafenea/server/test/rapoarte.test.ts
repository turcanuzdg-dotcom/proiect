import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pregateste } from './ajutor';

let t: Awaited<ReturnType<typeof pregateste>>;
const zi = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  t = await pregateste({ zileIstoric: 21 });
}, 120_000);
afterAll(async () => {
  await t.app.close();
  await t.db.close();
});

describe('rapoarte pe istoric', () => {
  it('vânzările pe produs se potrivesc cu încasările din registrul de bani', async () => {
    const q = `de=${zi(30)}&pana=${zi(-1)}`;
    const { randuri, serie } = await t.admin.get(`/api/rapoarte/vanzari?${q}`);
    const totalProduse = randuri.reduce((s: number, r: any) => s + r.incasari, 0);
    const bani = await t.admin.get(`/api/bani/rezumat?${q}`);
    const incasari = bani.reduce((s: number, b: any) => s + b.incasari_numerar + b.incasari_card, 0);
    expect(totalProduse).toBeCloseTo(incasari, 2);
    expect(serie.reduce((s: number, x: any) => s + x.incasari, 0)).toBeCloseTo(incasari, 2);
    for (const r of randuri) {
      expect(r.cost).toBeGreaterThan(0);
      expect(r.marja).toBeCloseTo(r.incasari - r.cost, 2);
    }
  });

  it('pe categorii, totalul e același ca pe produse', async () => {
    const q = `de=${zi(30)}&pana=${zi(-1)}&locatie_id=${t.demo.locatii.centru}`;
    const p = (await t.admin.get(`/api/rapoarte/vanzari?${q}`)).randuri;
    const c = (await t.admin.get(`/api/rapoarte/vanzari?${q}&grupare=categorie`)).randuri;
    const suma = (x: any[]) => x.reduce((s, r) => s + r.incasari, 0);
    expect(suma(c)).toBeCloseTo(suma(p), 2);
    expect(c.map((r: any) => r.nume)).toContain('Cafea caldă');
  });

  it('compară două săptămâni produs cu produs', async () => {
    const r = await t.admin.get(`/api/rapoarte/comparatie?a_de=${zi(14)}&a_pana=${zi(7)}&b_de=${zi(7)}&b_pana=${zi(0)}`);
    expect(r.randuri.length).toBeGreaterThan(5);
    expect(r.total_a).toBeGreaterThan(0);
    expect(r.total_b).toBeGreaterThan(0);
    const latte = r.randuri.find((x: any) => x.nume === 'Latte');
    expect(latte.dif_incasari).toBeCloseTo(latte.b_incasari - latte.a_incasari, 2);
    expect(r.randuri.reduce((s: number, x: any) => s + x.a_incasari, 0)).toBeCloseTo(r.total_a, 2);
  });

  it('consumul de materie primă se raportează în kg, litri și bucăți, pe locații', async () => {
    const r = await t.admin.get(`/api/rapoarte/consum?de=${zi(30)}&pana=${zi(-1)}`);
    const cafea = r.filter((x: any) => x.nume === 'Cafea boabe');
    expect(cafea).toHaveLength(2);
    for (const c of cafea) {
      expect(c.um_afisat).toBe('kg');
      expect(c.total_afisat).toBeCloseTo(c.total / 1000, 3);
      expect(c.valoare).toBeGreaterThan(0);
    }
    expect(r.find((x: any) => x.nume === 'Lapte 3,2%').um_afisat).toBe('l');
    expect(r.find((x: any) => x.nume === 'Capac').um_afisat).toBe('buc');
  });

  it('raportul de pierderi arată casările pe motive și diferențele de casă', async () => {
    const r = await t.admin.get(`/api/rapoarte/pierderi?de=${zi(30)}&pana=${zi(-1)}`);
    expect(r.casari.length).toBeGreaterThan(0);
    for (const c of r.casari) {
      expect(c.eticheta).toBeTruthy();
      expect(c.valoare_cost).toBeGreaterThan(0);
    }
    expect(r.casa.minus).toBeLessThan(0);
    expect(r.total_pierderi_cost).toBeGreaterThan(0);
  });

  it('turele închise cu lipsă de bani sunt marcate', async () => {
    const ture = await t.admin.get('/api/ture?doar_discrepante=true');
    expect(ture.length).toBeGreaterThan(0);
    expect(ture.every((x: any) => x.are_discrepante)).toBe(true);
    expect(ture.some((x: any) => x.dif_numerar < 0 || x.dif_doze > 0)).toBe(true);
  });

  it('stocul rămâne pozitiv după trei săptămâni de vânzări cu aprovizionare săptămânală', async () => {
    const stoc = await t.admin.get(`/api/stoc?locatie_id=${t.demo.locatii.centru}`);
    for (const a of stoc) expect(a.stoc, a.nume).toBeGreaterThanOrEqual(0);
  });
});
