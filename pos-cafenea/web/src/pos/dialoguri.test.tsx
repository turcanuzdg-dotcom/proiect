// @vitest-environment happy-dom
// Dialogurile de plată și de anulare pe card: tableta nu se blochează cât un rezultat e nelămurit, iar o
// comandă pe card se poate anula și când terminalul nu poate face returul (se face din meniul lui).
import 'fake-indexeddb/auto';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { COD_TERMINAL, type EvenimentPOS } from '@cafenea/shared';
import { tabletaOcupata } from './blocare';
import { ContextAplicatie, type Aplicatie } from './context';
import { Anulare, PlataCard } from './dialoguri';
import type { Echipamente, RezultatCard } from './echipamente';
import * as stocare from './stocare';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let radacina: Root | null = null;
let gazda: HTMLElement | null = null;

beforeAll(() => {
  vi.stubGlobal('confirm', () => true);
});

afterEach(async () => {
  if (radacina) await act(async () => radacina!.unmount());
  gazda?.remove();
  radacina = null;
});

async function randeaza(el: ReactElement) {
  gazda = document.createElement('div');
  document.body.appendChild(gazda);
  radacina = createRoot(gazda);
  await act(async () => radacina!.render(el));
}

/** Așteaptă (cu act) până când condiția e adevărată: IndexedDB și promisiunile echipamentelor sunt asincrone. */
async function pana(conditie: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (conditie()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  throw new Error('Condiția nu s-a îndeplinit');
}

const butoane = () => [...document.querySelectorAll('button')];
const buton = (text: RegExp) => butoane().find((b) => text.test(b.textContent ?? ''));
async function apasa(text: RegExp) {
  const b = buton(text);
  if (!b) throw new Error(`Lipsește butonul ${text}: ${butoane().map((x) => x.textContent).join(' | ')}`);
  await act(async () => b.click());
}
const textPagina = () => document.body.textContent ?? '';

function echipamente(e: Partial<Echipamente>): Echipamente {
  return {
    descriere: 'Terminal de test',
    poateDuplica: false,
    manual: false,
    platesteCard: async () => ({ aprobat: false }),
    returCard: async () => ({ aprobat: false }),
    tiparesteBon: async () => ({ ok: true }),
    tiparesteRetur: async () => ({ ok: true }),
    tiparesteDuplicat: async () => ({ ok: true }),
    raportZ: async () => ({ ok: true }),
    verifica: async () => ({ terminal: 'test', imprimanta: 'test' }),
    ...e,
  };
}

function aplicatie(e: Echipamente) {
  const inregistrate: EvenimentPOS[] = [];
  const app = {
    config: { token: 't', dispozitiv: { id: 1, nume: 'Tabletă', locatie_id: 1 } },
    catalog: { versiune: 'v', locatie: { id: 1, nume: 'Centru' }, categorii: [], produse: [], modificatori: [], baristi: [], generat_la: '' },
    barista: { id: 7, nume: 'Ana' },
    tura: { id: '00000000-0000-4000-8000-0000000000aa', deschisa_la: new Date().toISOString(), fond_initial: 0, deschisa_de: 7 },
    echipamente: e,
    sync: {} as Aplicatie['sync'],
    async inregistreaza(ev: EvenimentPOS, comanda?: stocare.ComandaLocala) {
      inregistrate.push(ev);
      await stocare.inregistreaza(ev, comanda);
    },
    eveniment: (tip: string, date: unknown) => ({ id: crypto.randomUUID(), tip, la: new Date().toISOString(), date }),
    anunta: vi.fn(),
    inchideTura() {},
    blocheaza() {},
    reincarcaEchipamente: async () => {},
    retrimiteJurnal: async () => ({ trimise: 0, respinse: 0 }),
  } as unknown as Aplicatie;
  return { app, inregistrate };
}

describe('plata cu cardul prin terminal', () => {
  it('tableta nu se blochează cât dialogul arată o plată nesigură, nu doar cât așteaptă', async () => {
    let raspunde!: (r: RezultatCard) => void;
    const e = echipamente({ platesteCard: () => new Promise<RezultatCard>((ok) => (raspunde = ok)) });
    const { app } = aplicatie(e);
    await randeaza(
      <ContextAplicatie.Provider value={app}>
        <PlataCard total={45} referinta={crypto.randomUUID()} onAprobat={async () => {}} onInchide={() => {}} onReferintaNoua={() => {}} />
      </ContextAplicatie.Provider>,
    );
    expect(tabletaOcupata()).toBe(true);
    await act(async () => raspunde({ aprobat: false, nesigur: true, mesaj: 'Nu se poate confirma plata' }));
    await pana(() => textPagina().includes('Plata nu este confirmată'));
    expect(tabletaOcupata()).toBe(true);
    await act(async () => radacina!.unmount());
    radacina = null;
    expect(tabletaOcupata()).toBe(false);
  });

  it('o plată aprobată deja pentru altă sumă: suma aprobată, fără „trimite o plată nouă” sau reîncercare', async () => {
    const e = echipamente({
      platesteCard: async () => ({ aprobat: false, cod: COD_TERMINAL.plataDejaAprobata, suma_anterioara: 45, mesaj: 'deja aprobată' }),
    });
    const { app } = aplicatie(e);
    await randeaza(
      <ContextAplicatie.Provider value={app}>
        <PlataCard total={52} referinta={crypto.randomUUID()} onAprobat={async () => {}} onInchide={() => {}} onReferintaNoua={() => {}} />
      </ContextAplicatie.Provider>,
    );
    await pana(() => textPagina().includes('Clientul a plătit deja'));
    expect(textPagina()).toMatch(/45[.,]00/);
    expect(buton(/plată nouă/)).toBeUndefined();
    expect(buton(/din nou/)).toBeUndefined();
    expect(tabletaOcupata()).toBe(true);
  });
});

describe('anularea unei comenzi pe card cu terminal prin server', () => {
  async function comandaCard(): Promise<stocare.ComandaLocala> {
    const c: stocare.ComandaLocala = {
      comanda_id: crypto.randomUUID(), tura_id: '00000000-0000-4000-8000-0000000000aa', nr: 3, la: new Date().toISOString(), metoda: 'card',
      motiv_casare: null, linii: [], total: 45, primit: null, rest: null, card_autorizare: null, barista: { id: 7, nume: 'Ana' },
      stare: 'finalizata', bon_tiparit: true, bon_pe_terminal: true,
    };
    await stocare.inregistreaza({ id: crypto.randomUUID(), tip: 'plata_marunta', la: c.la, date: {} } as unknown as EvenimentPOS, c);
    return c;
  }

  async function deschide(e: Echipamente) {
    const comanda = await comandaCard();
    const { app, inregistrate } = aplicatie(e);
    const gata = vi.fn();
    await randeaza(
      <ContextAplicatie.Provider value={app}>
        <Anulare comanda={comanda} onInapoi={() => {}} onGata={gata} />
      </ContextAplicatie.Provider>,
    );
    await apasa(/Clientul a renunțat/);
    await apasa(/ingredientele revin/);
    const anulari = () => inregistrate.filter((x) => x.tip === 'comanda_anulata');
    return { comanda, gata, anulari };
  }

  it('fără plată înregistrată prin server: returul din meniul terminalului, apoi anularea se înregistrează', async () => {
    const returCard = vi.fn(async (): Promise<RezultatCard> => ({ aprobat: false, cod: COD_TERMINAL.returDinMeniu, mesaj: 'Returul pe card se face din meniul terminalului' }));
    const { gata, anulari } = await deschide(echipamente({ returCard }));
    await apasa(/Anulează și restituie/);
    await pana(() => !!buton(/Am restituit .* din terminal/));
    expect(textPagina()).toMatch(/Faceți întâi returul de 45[.,]00/);
    expect(anulari()).toHaveLength(0);
    await apasa(/Am restituit .* din terminal/);
    await pana(() => gata.mock.calls.length > 0);
    expect(anulari()).toHaveLength(1);
    // Calea manuală nu mai trimite nimic la terminal.
    expect(returCard).toHaveBeenCalledTimes(1);
  });

  it('un retur nesigur: barista vede pe terminal că s-a făcut și anularea se înregistrează fără alt retur', async () => {
    const returCard = vi.fn(async (): Promise<RezultatCard> => ({ aprobat: false, nesigur: true, mesaj: 'Nu se poate confirma returul' }));
    const { gata, anulari } = await deschide(echipamente({ returCard }));
    await apasa(/Anulează și restituie/);
    await pana(() => !!buton(/returul s-a făcut/));
    // „Verifică din nou” întreabă serverul, care verifică pe terminal; tot nesigur.
    await apasa(/Verifică returul din nou/);
    await pana(() => returCard.mock.calls.length === 2 && !!buton(/returul s-a făcut/));
    await apasa(/returul s-a făcut/);
    await pana(() => gata.mock.calls.length > 0);
    expect(anulari()).toHaveLength(1);
    expect(returCard).toHaveBeenCalledTimes(2);
  });

  it('un retur nesigur care nu s-a făcut: se face din meniul terminalului, apoi anularea', async () => {
    const returCard = vi.fn(async (): Promise<RezultatCard> => ({ aprobat: false, nesigur: true, mesaj: 'Nu se poate confirma returul' }));
    const { gata, anulari } = await deschide(echipamente({ returCard }));
    await apasa(/Anulează și restituie/);
    await pana(() => !!buton(/îl fac din meniul terminalului/));
    expect(tabletaOcupata()).toBe(true);
    await apasa(/îl fac din meniul terminalului/);
    await apasa(/Am restituit .* din terminal/);
    await pana(() => gata.mock.calls.length > 0);
    expect(anulari()).toHaveLength(1);
    expect(returCard).toHaveBeenCalledTimes(1);
  });

  it('un retur aprobat înregistrează anularea direct', async () => {
    const returCard = vi.fn(async (): Promise<RezultatCard> => ({ aprobat: true, rrn: 'R-1' }));
    const { gata, anulari } = await deschide(echipamente({ returCard }));
    await apasa(/Anulează și restituie/);
    await pana(() => gata.mock.calls.length > 0);
    expect(anulari()).toHaveLength(1);
  });
});
