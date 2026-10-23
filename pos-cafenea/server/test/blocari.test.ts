// Scrieri simultane pe aceeași locație (blocările pe locație din ture.ts și stoc.ts): o mișcare de casă
// în timpul închiderii turei, o vânzare târzie în timpul finalizării inventarierii. Cursa are nevoie de
// două conexiuni reale; PGlite are una singură și serializează totul, deci testele rulează doar pe
// PostgreSQL (TEST_DATABASE_URL=postgres://postgres@.../postgres npm test).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adaugaMiscareBani } from '../src/servicii/bani';
import { finalizeazaInventariere } from '../src/servicii/inventar';
import { inchideTura } from '../src/servicii/ture';
import { inregistreazaComanda } from '../src/servicii/vanzari';
import { evComanda, evTuraDeschisa, pregateste, tableteVechi } from './ajutor';

const URL_TEST = process.env.TEST_DATABASE_URL;
if (!URL_TEST) {
  console.info('blocari.test.ts: sărit — cursele dintre tranzacții cer PostgreSQL real (TEST_DATABASE_URL); PGlite are o singură conexiune.');
}

const asteapta = (ms: number) => new Promise((r) => setTimeout(r, ms));
const acumMinus = (minute: number) => new Date(Date.now() - minute * 60_000).toISOString();

describe.skipIf(!URL_TEST)('blocări pe locație (PostgreSQL)', () => {
  let t: Awaited<ReturnType<typeof pregateste>>;
  beforeAll(async () => {
    t = await pregateste();
  });
  afterAll(async () => {
    await t.app.close();
    await t.db.close();
  });

  /** O cafenea nouă, cu tura deschisă la 500 lei și o vânzare de 40 lei în numerar. */
  async function cafeneaCuTura(nume: string) {
    const loc = await t.admin.post('/api/locatii', { nume, tip: 'punct' });
    const tableta = await t.admin.post('/api/dispozitive', { nume: `Tabletă ${nume}`, locatie_id: loc.id });
    await tableteVechi(t.db);
    const token = (await t.app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: tableta.cod_asociere } })).json().token as string;
    const sync = async (evenimente: unknown[]) =>
      (await t.app.inject({ method: 'POST', url: '/api/pos/sync', payload: { evenimente }, headers: { authorization: `Bearer ${token}` } })).json();
    const barista = (await t.admin.post('/api/utilizatori', { nume: `Barista ${nume}`, rol: 'barista', pin: '3579', locatie_id: loc.id, activ: true })).id as number;
    const tura = randomUUID();
    const esp = t.produs('Espresso');
    const r = await sync([
      evTuraDeschisa(tura, barista, 500, acumMinus(120)),
      evComanda(tura, barista, [{ produs_id: esp.id, cantitate: 1, pret_unitar: 40, modificatori: [] }], 'numerar', { primit: 40, la: acumMinus(90) }),
    ]);
    expect(r.cu_eroare).toEqual([]);
    const [{ id: dispozitivId }] = await t.db.query<{ id: number }>('SELECT id FROM dispozitive WHERE locatie_id = $1', [loc.id]);
    const sold = async () =>
      (await t.db.query<{ s: number }>(`SELECT COALESCE(SUM(suma), 0)::numeric AS s FROM miscari_bani WHERE locatie_id = $1 AND cont = 'numerar'`, [loc.id]))[0].s;
    return { loc, sync, barista, tura, dispozitivId, sold };
  }

  const adminId = async () => (await t.db.query<{ id: number }>(`SELECT id FROM utilizatori WHERE login = 'admin'`))[0].id;

  it('o ridicare de numerar din panou, nevalidată încă, e văzută de închiderea turei', async () => {
    const c = await cafeneaCuTura('Cursa Casa 1');
    // Ridicarea de 300 lei (făcută la 60 de minute în urmă) stă deschisă cât închide barista.
    const ridicare = t.db.tx(async (tx) => {
      await adaugaMiscareBani(tx, { locatie_id: c.loc.id, tip: 'depunere', suma: 300, descriere: 'Ridicat pentru bancă', la: acumMinus(60) }, await adminId());
      await asteapta(600);
    });
    await asteapta(150);
    const inchidere = c.sync([
      { id: randomUUID(), tip: 'tura_inchisa', la: acumMinus(10), date: { tura_id: c.tura, utilizator_id: c.barista, doze: 1, numerar: 240, card: 0, anulari: 0, casari: 0 } },
    ]);
    const [, r] = await Promise.all([ridicare, inchidere]);
    expect(r.cu_eroare).toEqual([]);
    const tura = await t.admin.get(`/api/ture/${c.tura}`);
    expect(tura.dif_numerar).toBe(0);
    expect(tura.are_discrepante).toBe(false);
    expect(await c.sold()).toBe(240);
  });

  it('o ridicare de numerar scrisă în timpul închiderii corectează numărarea de după ea', async () => {
    const c = await cafeneaCuTura('Cursa Casa 2');
    const ctx = { locatie_id: c.loc.id, dispozitiv_id: c.dispozitivId };
    // Închiderea (barista a numărat 240: ridicarea s-a făcut înainte) stă deschisă cât adminul scrie ridicarea.
    const inchidere = t.db.tx(async (tx) => {
      await inchideTura(tx, ctx, acumMinus(10), { tura_id: c.tura, utilizator_id: c.barista, doze: 1, numerar: 240, card: 0, anulari: 0, casari: 0 });
      await asteapta(600);
    });
    await asteapta(150);
    const ridicare = t.admin.post('/api/bani/miscari', { locatie_id: c.loc.id, tip: 'depunere', suma: 300, descriere: 'Ridicat pentru bancă', la: acumMinus(60) });
    await Promise.all([inchidere, ridicare]);
    const tura = await t.admin.get(`/api/ture/${c.tura}`);
    expect(tura.dif_numerar).toBe(0);
    expect(tura.are_discrepante).toBe(false);
    expect(await c.sold()).toBe(240);
  });

  /** Inventariere pe Centru: laptele numărat acum are cu 250 ml mai puțin (un Latte vândut offline, încă nesincronizat). */
  async function inventariereCuLapteLipsa() {
    const { centru } = t.demo.locatii;
    const lapte = t.idArticol('Lapte 3,2%');
    const scriptic = await t.stoc(centru, 'Lapte 3,2%');
    const inv = await t.admin.post('/api/inventarieri', { locatie_id: centru });
    await t.admin.put(`/api/inventarieri/${inv.id}/linii`, { linii: [{ articol_id: lapte, faptic: scriptic - 250 }] });
    const tura = randomUUID();
    expect((await t.tableta.sync([evTuraDeschisa(tura, t.barista, 0, acumMinus(60))])).cu_eroare).toEqual([]);
    const latte = t.produs('Latte');
    const vanzare = evComanda(tura, t.barista, [{ produs_id: latte.id, cantitate: 1, pret_unitar: latte.pret, modificatori: [] }], 'card', { la: acumMinus(30) });
    return { centru, inv, scriptic, vanzare };
  }

  it('o vânzare târzie, nevalidată încă, e văzută de finalizarea inventarierii', async () => {
    const { centru, inv, scriptic, vanzare } = await inventariereCuLapteLipsa();
    const [{ id: dispozitivId }] = await t.db.query<{ id: number }>('SELECT id FROM dispozitive WHERE locatie_id = $1 AND token IS NOT NULL ORDER BY id LIMIT 1', [centru]);
    const vanzareDeschisa = t.db.tx(async (tx) => {
      await inregistreazaComanda(tx, { locatie_id: centru, dispozitiv_id: dispozitivId }, vanzare.la, vanzare.date);
      await asteapta(600);
    });
    await asteapta(150);
    const finalizare = t.admin.post(`/api/inventarieri/${inv.id}/finalizeaza`);
    await Promise.all([vanzareDeschisa, finalizare]);
    // Vânzarea era deja în cantitatea numărată: stocul e exact cel numărat, fără lipsă falsă.
    expect(await t.stoc(centru, 'Lapte 3,2%')).toBe(scriptic - 250);
  });

  it('o vânzare târzie scrisă în timpul finalizării se compensează pe inventariere', async () => {
    const { centru, inv, scriptic, vanzare } = await inventariereCuLapteLipsa();
    const finalizare = t.db.tx(async (tx) => {
      await finalizeazaInventariere(tx, inv.id);
      await asteapta(600);
    });
    await asteapta(150);
    const sync = t.tableta.sync([vanzare]);
    const [, r] = await Promise.all([finalizare, sync]);
    expect(r.cu_eroare).toEqual([]);
    expect(await t.stoc(centru, 'Lapte 3,2%')).toBe(scriptic - 250);
  });
});
