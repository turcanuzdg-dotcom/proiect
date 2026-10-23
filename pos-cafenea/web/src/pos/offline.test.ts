// Coada offline a tabletei: ce se salvează local rămâne acolo până când serverul confirmă.
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EvenimentPOS, RaspunsSync } from '@cafenea/shared';
import { ceasGresit, Sincronizator, type StareSync } from './sincronizare';
import * as stocare from './stocare';

let nr = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++nr).padStart(12, '0')}`;
const ev = (tip: EvenimentPOS['tip'] = 'plata_marunta'): EvenimentPOS =>
  ({ id: uuid(), tip, la: new Date().toISOString(), date: { tura_id: uuid(), utilizator_id: 1, suma: 5, descriere: 'test' } }) as EvenimentPOS;
const comanda = (id: string, turaId: string, la: string): stocare.ComandaLocala => ({
  comanda_id: id, tura_id: turaId, nr: 1, la, metoda: 'numerar', motiv_casare: null, linii: [], total: 10, primit: 10, rest: 0,
  card_autorizare: null, barista: { id: 1, nume: 'Test' }, stare: 'finalizata', bon_tiparit: true,
});

beforeAll(() => {
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('navigator', { onLine: true });
});

/** Un server fals: ce răspunde la fiecare apel, în ordine; `null` = fără conexiune. */
type Raspuns = RaspunsSync | 'offline' | 401;
function serverFals(raspunsuri: Raspuns[]) {
  const primite: EvenimentPOS[][] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      primite.push(JSON.parse(String(init.body)).evenimente);
      const r = raspunsuri.length > 1 ? raspunsuri.shift()! : raspunsuri[0];
      if (r === 'offline') throw new TypeError('Failed to fetch');
      if (r === 401) return new Response(JSON.stringify({ eroare: 'Tableta nu este asociată' }), { status: 401 });
      return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
  return primite;
}

const accepta = (evs: EvenimentPOS[]): RaspunsSync => ({ acceptate: evs.map((e) => e.id), cu_eroare: [], catalog_versiune: 'v1', ora_server: new Date().toISOString() });

function sincronizeaza(predicat: (s: StareSync) => boolean, catalogSchimbat = () => {}) {
  const s = new Sincronizator('token', () => 'v1', catalogSchimbat);
  let initial = true; // abonarea primește întâi starea de dinainte de orice sincronizare
  const gata = new Promise<StareSync>((rezolva) =>
    s.aboneaza((st) => {
      if (initial) initial = false;
      else if (predicat(st)) rezolva(st);
    }),
  );
  s.acum();
  return gata.then((st) => {
    s.opreste();
    return st;
  });
}

afterEach(async () => {
  // Golim coada (și jurnalul de retrimitere) între teste, ca fiecare să pornească de la zero.
  const r = await stocare.primeleDinCoada(1000);
  await stocare.scoateDinCoada(r.map((x) => x.secv));
  await stocare.scoateDinCoada([-1], Date.now() + 30 * 86_400_000);
  vi.unstubAllGlobals();
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('navigator', { onLine: true });
});

describe('memoria locală a tabletei', () => {
  it('evenimentul și comanda se salvează împreună, iar coada păstrează ordinea', async () => {
    const tura = uuid();
    const e1 = ev('comanda');
    const e2 = ev('comanda');
    await stocare.inregistreaza(e1, comanda(uuid(), tura, '2026-10-20T08:00:00Z'));
    await stocare.inregistreaza(e2, comanda(uuid(), tura, '2026-10-20T09:00:00Z'));
    expect(await stocare.numarInCoada()).toBe(2);
    expect((await stocare.primeleDinCoada(10)).map((x) => x.ev.id)).toEqual([e1.id, e2.id]);
    const c = await stocare.comenziTura(tura);
    expect(c).toHaveLength(2);
    expect(c[0].la > c[1].la).toBe(true); // cele mai noi primele
  });

  it('numărul de bon crește și offline, fără să se repete', async () => {
    const a = await stocare.urmatorulNumar();
    const b = await stocare.urmatorulNumar();
    expect(b).toBe(a + 1);
  });

  it('dezasocierea șterge configurația, dar nu și evenimentele netrimise', async () => {
    await stocare.scrie('config', { token: 't', dispozitiv: { id: 1, nume: 'T', locatie_id: 1 } });
    await stocare.inregistreaza(ev());
    await stocare.stergeConfigurarea();
    expect(await stocare.citeste('config')).toBeUndefined();
    expect(await stocare.numarInCoada()).toBe(1);
  });

  it('curățarea păstrează comenzile din ultimele 3 zile', async () => {
    const tura = uuid();
    await stocare.salveazaComanda(comanda(uuid(), tura, new Date(Date.now() - 5 * 86_400_000).toISOString()));
    await stocare.salveazaComanda(comanda(uuid(), tura, new Date().toISOString()));
    await stocare.curataComenziVechi();
    expect(await stocare.comenziTura(tura)).toHaveLength(1);
  });
});

describe('sincronizarea', () => {
  it('fără conexiune, coada rămâne intactă și tableta se declară offline', async () => {
    const evs = [ev(), ev()];
    for (const e of evs) await stocare.inregistreaza(e);
    serverFals(['offline']);
    const s = await sincronizeaza((st) => !st.online && st.inAsteptare === 2);
    expect(s.dezasociata).toBe(false);
    expect((await stocare.primeleDinCoada(10)).map((x) => x.ev.id)).toEqual(evs.map((e) => e.id));
  });

  it('când revine conexiunea, trimite tot, în ordine, în loturi de 100', async () => {
    const evs = Array.from({ length: 230 }, () => ev());
    for (const e of evs) await stocare.inregistreaza(e);
    const primite = serverFals([{ acceptate: [], cu_eroare: [], catalog_versiune: 'v1', ora_server: new Date().toISOString() }]);
    (fetch as any).mockImplementation(async (_url: string, init: RequestInit) => {
      const lot = JSON.parse(String(init.body)).evenimente as EvenimentPOS[];
      primite.push(lot);
      return new Response(JSON.stringify(accepta(lot)), { status: 200 });
    });
    const s = await sincronizeaza((st) => st.online && st.inAsteptare === 0);
    expect(s.ultimaSincronizare).toBeTruthy();
    expect(primite.map((l) => l.length)).toEqual([100, 100, 30]);
    expect(primite.flat().map((e) => e.id)).toEqual(evs.map((e) => e.id));
    expect(await stocare.numarInCoada()).toBe(0);
  });

  it('scoate din coadă doar ce a confirmat serverul; evenimentele respinse se numără', async () => {
    const [a, b, c] = [ev(), ev(), ev()];
    for (const e of [a, b, c]) await stocare.inregistreaza(e);
    // Serverul confirmă a și respinge b (le vede adminul); c rămâne de trimis — de ex. răspuns trunchiat.
    serverFals([
      { acceptate: [a.id], cu_eroare: [{ id: b.id, eroare: 'Produsul nu există' }], catalog_versiune: 'v1', ora_server: new Date().toISOString() },
      { acceptate: [c.id], cu_eroare: [], catalog_versiune: 'v1', ora_server: new Date().toISOString() },
    ]);
    const s = await sincronizeaza((st) => st.online && st.inAsteptare === 0);
    expect(s.respinse).toBe(1);
  });

  it('un lot refuzat ca prea mare (413) pleacă pe bucăți, fără să blocheze coada', async () => {
    const evs = Array.from({ length: 30 }, () => ev());
    for (const e of evs) await stocare.inregistreaza(e);
    const primite: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const lot = JSON.parse(String(init.body)).evenimente as EvenimentPOS[];
        primite.push(lot.length);
        // Serverul primește cel mult 8 evenimente într-o cerere.
        if (lot.length > 8) return new Response(JSON.stringify({ eroare: 'Cererea este prea mare' }), { status: 413 });
        return new Response(JSON.stringify(accepta(lot)), { status: 200 });
      }),
    );
    const s = await sincronizeaza((st) => st.online && st.inAsteptare === 0);
    expect(s.online).toBe(true);
    expect(primite.slice(0, 3)).toEqual([30, 15, 7]);
    expect(await stocare.numarInCoada()).toBe(0);
  });

  it('un token respins (tableta dezactivată) oprește trimiterea fără să piardă nimic', async () => {
    await stocare.inregistreaza(ev());
    serverFals([401]);
    const s = await sincronizeaza((st) => st.dezasociata);
    expect(s.online).toBe(false);
    expect(await stocare.numarInCoada()).toBe(1);
  });

  it('o versiune nouă de catalog pe server declanșează reîncărcarea', async () => {
    await stocare.inregistreaza(ev());
    serverFals([{ acceptate: [], cu_eroare: [], catalog_versiune: 'v2', ora_server: new Date().toISOString() }]);
    (fetch as any).mockImplementation(async (_url: string, init: RequestInit) => {
      const lot = JSON.parse(String(init.body)).evenimente as EvenimentPOS[];
      return new Response(JSON.stringify({ ...accepta(lot), catalog_versiune: 'v2' }), { status: 200 });
    });
    const schimbat = vi.fn();
    await sincronizeaza((st) => st.online && st.inAsteptare === 0, schimbat);
    expect(schimbat).toHaveBeenCalled();
  });

  it('ora serverului din răspuns dă decalajul ceasului; peste 5 minute tableta îl semnalează', async () => {
    const inUrma = 3 * 3_600_000; // ceasul tabletei e cu 3 ore în urmă
    serverFals([{ acceptate: [], cu_eroare: [], catalog_versiune: 'v1', ora_server: new Date(Date.now() + inUrma).toISOString() }]);
    const s = await sincronizeaza((st) => st.decalajCeas != null);
    expect(Math.abs(s.decalajCeas! - inUrma)).toBeLessThan(5_000);
    expect(ceasGresit(s)).toBe(true);

    serverFals([{ acceptate: [], cu_eroare: [], catalog_versiune: 'v1', ora_server: new Date(Date.now() + 60_000).toISOString() }]);
    const bun = await sincronizeaza((st) => st.decalajCeas != null);
    expect(ceasGresit(bun)).toBe(false);
  });
});

describe('jurnalul de retrimitere (ultimele 7 zile)', () => {
  it('evenimentele confirmate trec din coadă în jurnal, în aceeași ordine', async () => {
    const evs = [ev('tura_deschisa'), ev('comanda'), ev()];
    for (const e of evs) await stocare.inregistreaza(e);
    serverFals([{ acceptate: [], cu_eroare: [], catalog_versiune: 'v1', ora_server: new Date().toISOString() }]);
    (fetch as any).mockImplementation(async (_url: string, init: RequestInit) => {
      const lot = JSON.parse(String(init.body)).evenimente as EvenimentPOS[];
      return new Response(JSON.stringify(accepta(lot)), { status: 200 });
    });
    await sincronizeaza((st) => st.online && st.inAsteptare === 0);
    expect(await stocare.numarInCoada()).toBe(0);
    expect((await stocare.evenimenteDinJurnal(10)).map((x) => x.ev.id)).toEqual(evs.map((e) => e.id));
  });

  it('jurnalul uită ce e mai vechi de 7 zile', async () => {
    const vechi = ev();
    await stocare.inregistreaza(vechi);
    const [x] = await stocare.primeleDinCoada(1);
    await stocare.scoateDinCoada([x.secv], Date.now() - 8 * 86_400_000);
    const nou = ev();
    await stocare.inregistreaza(nou);
    const [y] = await stocare.primeleDinCoada(1);
    await stocare.scoateDinCoada([y.secv]);
    expect((await stocare.evenimenteDinJurnal(10)).map((e) => e.ev.id)).toEqual([nou.id]);
  });

  it('„Retrimite” trimite tot jurnalul în ordine, fără să-l golească, și numără respingerile', async () => {
    const evs = Array.from({ length: 130 }, () => ev());
    for (const e of evs) await stocare.inregistreaza(e);
    await stocare.scoateDinCoada((await stocare.primeleDinCoada(1000)).map((x) => x.secv));
    const primite: EvenimentPOS[][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const lot = JSON.parse(String(init.body)).evenimente as EvenimentPOS[];
        primite.push(lot);
        // Serverul restaurat le primește din nou; unul e respins (ajunge la Erori sincronizare).
        const r = accepta(lot.filter((e) => e.id !== evs[50].id));
        return new Response(JSON.stringify({ ...r, cu_eroare: lot.some((e) => e.id === evs[50].id) ? [{ id: evs[50].id, eroare: 'x' }] : [] }), { status: 200 });
      }),
    );
    const s = new Sincronizator('token', () => 'v1', () => {});
    const r = await s.retrimiteJurnal();
    s.opreste();
    expect(r).toEqual({ trimise: 130, respinse: 1 });
    expect(primite.map((l) => l.length)).toEqual([100, 30]);
    expect(primite.flat().map((e) => e.id)).toEqual(evs.map((e) => e.id));
    expect(await stocare.numarInJurnal()).toBe(130);
  });
});
