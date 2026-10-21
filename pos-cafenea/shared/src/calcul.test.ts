import { describe, expect, it } from 'vitest';
import {
  calculeazaRest,
  consumLinie,
  expandeazaReteta,
  inUnitateMare,
  rotunjeste,
  totalComanda,
  type DefinitieModificator,
} from './index';

const CAFEA = 1, LAPTE = 2, OVAZ = 3, PAHAR = 4, CAPAC = 5, ZAHAR = 6;

const cappuccino = [
  { articol_id: CAFEA, cantitate: 18 },
  { articol_id: LAPTE, cantitate: 150 },
  { articol_id: PAHAR, cantitate: 1 },
  { articol_id: CAPAC, cantitate: 1 },
  { articol_id: ZAHAR, cantitate: 1 },
];

const lapteOvaz: DefinitieModificator = {
  id: 1, nume: 'Lapte de ovăz', pret: 10, doze_cafea: 0,
  inlocuieste_articol_id: LAPTE, inlocuitor_articol_id: OVAZ, adauga: [],
};
const extraShot: DefinitieModificator = {
  id: 2, nume: 'Extra shot', pret: 10, doze_cafea: 1,
  inlocuieste_articol_id: null, inlocuitor_articol_id: null, adauga: [{ articol_id: CAFEA, cantitate: 9 }],
};
const faraZahar: DefinitieModificator = {
  id: 3, nume: 'Fără zahăr', pret: 0, doze_cafea: 0,
  inlocuieste_articol_id: null, inlocuitor_articol_id: null, adauga: [{ articol_id: ZAHAR, cantitate: -1 }],
};

describe('rețetar', () => {
  it('scade exact rețeta de bază', () => {
    expect(Object.fromEntries(expandeazaReteta(cappuccino))).toEqual({
      [CAFEA]: 18, [LAPTE]: 150, [PAHAR]: 1, [CAPAC]: 1, [ZAHAR]: 1,
    });
  });

  it('laptele de ovăz înlocuiește laptele în aceeași cantitate, extra shot adaugă cafea', () => {
    const c = expandeazaReteta(cappuccino, [lapteOvaz, extraShot]);
    expect(c.get(LAPTE)).toBeUndefined();
    expect(c.get(OVAZ)).toBe(150);
    expect(c.get(CAFEA)).toBe(27);
  });

  it('adaosurile pe ingredientul înlocuit urmează înlocuirea', () => {
    const extraLapte: DefinitieModificator = {
      id: 4, nume: 'Extra lapte', pret: 5, doze_cafea: 0,
      inlocuieste_articol_id: null, inlocuitor_articol_id: null, adauga: [{ articol_id: LAPTE, cantitate: 50 }],
    };
    const maiPutinLapte: DefinitieModificator = { ...extraLapte, id: 5, nume: 'Mai puțin lapte', adauga: [{ articol_id: LAPTE, cantitate: -100 }] };
    const plus = expandeazaReteta(cappuccino, [lapteOvaz, extraLapte]);
    expect(plus.get(LAPTE)).toBeUndefined();
    expect(plus.get(OVAZ)).toBe(200);
    const minus = expandeazaReteta(cappuccino, [maiPutinLapte, lapteOvaz]);
    expect(minus.get(LAPTE)).toBeUndefined();
    expect(minus.get(OVAZ)).toBe(50);
  });

  it('un modificator negativ nu coboară sub zero', () => {
    const c = expandeazaReteta(cappuccino, [faraZahar, faraZahar]);
    expect(c.has(ZAHAR)).toBe(false);
  });

  it('înmulțește cu cantitatea liniei', () => {
    const c = consumLinie(cappuccino, [extraShot], 3);
    expect(c.get(CAFEA)).toBe(81);
    expect(c.get(PAHAR)).toBe(3);
  });
});

describe('bani', () => {
  it('totalul include modificatorii', () => {
    const total = totalComanda([
      { produs_id: 1, cantitate: 2, pret_unitar: 35, modificatori: [{ id: 1, pret: 10 }] },
      { produs_id: 2, cantitate: 1, pret_unitar: 19.9, modificatori: [] },
    ]);
    expect(total).toBe(109.9);
  });

  it('restul se rotunjește la bani', () => {
    expect(calculeazaRest(109.9, 200)).toBe(90.1);
    expect(rotunjeste(0.1 + 0.2)).toBe(0.3);
  });

  it('rapoartele afișează kg și litri', () => {
    expect(inUnitateMare(12500, 'g')).toEqual({ cantitate: 12.5, um: 'kg' });
    expect(inUnitateMare(3000, 'ml')).toEqual({ cantitate: 3, um: 'l' });
    expect(inUnitateMare(40, 'buc')).toEqual({ cantitate: 40, um: 'buc' });
  });
});
