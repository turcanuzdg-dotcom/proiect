// Reîmprospătarea raportului de inventariere deschis: o dată la 30 s, niciodată peste o cerere în curs
// (de ex. salvarea cantităților, PUT) și niciodată cât ecranul tabletei e ascuns.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Reimprospatare } from './reimprospatare';

const INTERVAL = 30_000;

function pregatire() {
  const stare = { activ: true, ascuns: false, cereri: 0 };
  const r: Reimprospatare = new Reimprospatare(
    () => {
      stare.cereri++;
      void r.urmareste(Promise.resolve());
    },
    () => stare.activ,
    () => stare.ascuns,
  );
  const opreste = r.porneste(INTERVAL);
  return { r, stare, opreste };
}

/** O promisiune pe care testul o termină când vrea (cererea „încă pe drum”). */
function inAsteptare() {
  let gata!: () => void;
  const p = new Promise<void>((res) => (gata = res));
  return { p, gata };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('reîmprospătarea periodică a inventarului', () => {
  it('cere o dată la 30 s, nu mai des', async () => {
    const { stare, opreste } = pregatire();
    await vi.advanceTimersByTimeAsync(INTERVAL - 1);
    expect(stare.cereri).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(stare.cereri).toBe(1);
    await vi.advanceTimersByTimeAsync(2 * INTERVAL);
    expect(stare.cereri).toBe(3);
    opreste();
    await vi.advanceTimersByTimeAsync(5 * INTERVAL);
    expect(stare.cereri).toBe(3);
  });

  it('nu cere cât o salvare (PUT) e încă în curs, apoi își reia ritmul', async () => {
    const { r, stare } = pregatire();
    const salvare = inAsteptare();
    const rezultat = r.urmareste(salvare.p);
    await vi.advanceTimersByTimeAsync(3 * INTERVAL);
    expect(stare.cereri).toBe(0);
    salvare.gata();
    await rezultat;
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(stare.cereri).toBe(1);
  });

  it('o cerere eșuată nu blochează reîmprospătarea', async () => {
    const { r, stare } = pregatire();
    await expect(r.urmareste(Promise.reject(new Error('fără internet')))).rejects.toThrow('fără internet');
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(stare.cereri).toBe(1);
  });

  it('nu cere cât ecranul e ascuns', async () => {
    const { stare } = pregatire();
    stare.ascuns = true;
    await vi.advanceTimersByTimeAsync(4 * INTERVAL);
    expect(stare.cereri).toBe(0);
    stare.ascuns = false;
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(stare.cereri).toBe(1);
  });

  it('nu cere după ce raportul nu mai e deschis (finalizat)', async () => {
    const { stare } = pregatire();
    stare.activ = false;
    await vi.advanceTimersByTimeAsync(3 * INTERVAL);
    expect(stare.cereri).toBe(0);
  });

  it('implicit citește document.visibilityState', () => {
    const vizibilitate = { visibilityState: 'hidden' };
    vi.stubGlobal('document', vizibilitate);
    try {
      let cereri = 0;
      const r = new Reimprospatare(() => cereri++, () => true);
      r.bataie();
      expect(cereri).toBe(0);
      vizibilitate.visibilityState = 'visible';
      r.bataie();
      expect(cereri).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
