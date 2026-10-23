// @vitest-environment happy-dom
// Blocarea automată a tabletei: ecranul de PIN acoperă vânzarea fără s-o închidă (coșul rămâne), nu vine
// cât e deschis dialogul plății cu cardul (nici după un rezultat nesigur) și nu aplică o versiune nouă
// peste un coș început.
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPin, type CatalogPOS } from '@cafenea/shared';
import { actualizare } from './actualizare';
import { App } from './App';
import * as stocare from './stocare';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SARE = 'sare-test';
const catalog = (terminalPrinServer: boolean): CatalogPOS => ({
  versiune: 'v1',
  locatie: { id: 1, nume: 'Cafenea Test' },
  categorii: [{ id: 1, nume: 'Cafea' }],
  produse: [{ id: 1, nume: 'Espresso', categorie_id: 1, pret: 20, doze_cafea: 1, modificatori: [] }],
  modificatori: [],
  baristi: [{ id: 7, nume: 'Ana', pin_hash: hashPin('1234', SARE), sare: SARE }],
  generat_la: new Date().toISOString(),
  terminal_prin_server: terminalPrinServer,
  blocare_automata_min: 3,
});

let radacina: Root | null = null;
let gazda: HTMLElement | null = null;

async function porneste(terminalPrinServer = false) {
  await stocare.scrie('config', { token: 't', dispozitiv: { id: 1, nume: 'Tabletă', locatie_id: 1 } });
  await stocare.scrie('catalog', catalog(terminalPrinServer));
  await stocare.scrie('barista', { id: 7, nume: 'Ana' });
  await stocare.scrie('tura', { id: crypto.randomUUID(), deschisa_la: new Date().toISOString(), fond_initial: 0, deschisa_de: 7 });
  gazda = document.createElement('div');
  document.body.appendChild(gazda);
  radacina = createRoot(gazda);
  await act(async () => radacina!.render(<App />));
  await pana(() => !!document.querySelector('.grila-produse'));
}

async function pana(conditie: () => boolean) {
  for (let i = 0; i < 300; i++) {
    if (conditie()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  throw new Error('Condiția nu s-a îndeplinit');
}

const buton = (text: RegExp) => [...document.querySelectorAll('button')].find((b) => text.test(b.textContent ?? ''));
async function apasa(text: RegExp) {
  const b = buton(text);
  if (!b) throw new Error(`Lipsește butonul ${text}`);
  await act(async () => b.click());
}
const liniiCos = () => document.querySelectorAll('.cos-linie').length;
const blocata = () => !!document.querySelector('.blocare-suprapusa');
/** Trec minutele fără atingere (intervalul de verificare rulează la 10 s). */
const trecMinute = (m: number) => act(async () => void vi.advanceTimersByTime(m * 60_000));

beforeEach(() => {
  // Doar ceasul și intervalul blocării: IndexedDB și React folosesc în continuare timpul real.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  // Serverul nu răspunde: sincronizarea rămâne offline, plata prin server iese nesigură.
  vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
});

afterEach(async () => {
  if (radacina) await act(async () => radacina!.unmount());
  gazda?.remove();
  radacina = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('blocarea automată', () => {
  it('ecranul de PIN acoperă vânzarea: după PIN, coșul început e tot acolo', async () => {
    await porneste();
    await apasa(/Espresso/);
    expect(liniiCos()).toBe(1);
    await trecMinute(4);
    await pana(blocata);
    expect(document.querySelector('.blocare-suprapusa')!.textContent).toMatch(/Cine lucrează acum/);
    expect(liniiCos()).toBe(1);
    // Repornită acum, tableta ar cere PIN-ul: barista nu mai e în memoria ei.
    await pana(() => true);
    expect(await stocare.citeste('barista')).toBeUndefined();
    for (const cifra of ['1', '2', '3', '4']) await apasa(new RegExp(`^${cifra}$`));
    await pana(() => !blocata());
    expect(liniiCos()).toBe(1);
  });

  it('nu se blochează cât dialogul plății cu cardul arată o plată nesigură', async () => {
    await porneste(true);
    await apasa(/Espresso/);
    await apasa(/^Card$/);
    await pana(() => (document.body.textContent ?? '').includes('Plata nu este confirmată'));
    await trecMinute(10);
    await pana(() => true);
    expect(blocata()).toBe(false);
    expect(document.body.textContent).toMatch(/Plata nu este confirmată/);
  });

  it('o versiune nouă nu se aplică pe ecranul de PIN peste un coș început', async () => {
    const aplica = vi.fn(async () => {});
    await porneste();
    await apasa(/Espresso/);
    await act(async () => actualizare.marcheaza(aplica));
    await trecMinute(4);
    await pana(blocata);
    expect(aplica).not.toHaveBeenCalled();
  });
});
