// Soldurile închise (servicii/solduri.ts) sunt doar o scurtătură: fiecare citire de stoc și de casă
// trebuie să dea exact aceleași cifre ca suma întregului registru, oricând ar rula închiderea, inclusiv
// pentru mișcări sincronizate târziu (id nou, dată veche), anulări, inventarieri și compensările lor.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rezumatBani } from '../src/servicii/bani';
import { panou } from '../src/servicii/panou';
import { BANI, inchideSolduri, inchisPana, sqlSold, STOC } from '../src/servicii/solduri';
import { fisaArticol, stocLocatie, stocToateLocatiile } from '../src/servicii/stoc';
import { soldNumerar } from '../src/servicii/ture';
import { evComanda, evTuraDeschisa, pregateste } from './ajutor';

let t: Awaited<ReturnType<typeof pregateste>>;
beforeAll(async () => {
  t = await pregateste({ zileIstoric: 6 });
}, 180_000);
afterAll(async () => {
  await t.app.close();
  await t.db.close();
});

/** Generator determinist (mulberry32): istoricul e același la fiecare rulare. */
function aleator(samanta: number) {
  let a = samanta;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = aleator(20261023);

const r3 = (x: number) => Math.round(Number(x) * 1000) / 1000;
const r2 = (x: number) => Math.round(Number(x) * 100) / 100;
const fara0 = (m: Map<string, number>) => new Map([...m].filter(([, v]) => v !== 0));

/** Suma întregului registru de stoc, pe (locație, articol), până la `la` (null = tot). */
async function brutStoc(la: string | null = null) {
  const r = await t.db.query<{ l: number; a: number; s: number }>(
    `SELECT locatie_id AS l, articol_id AS a, SUM(cantitate)::numeric AS s FROM miscari_stoc
      WHERE $1::timestamptz IS NULL OR creata_la <= $1::timestamptz GROUP BY 1, 2`,
    [la],
  );
  return new Map(r.map((x) => [`${x.l}:${x.a}`, r3(x.s)]));
}

async function brutBani(la: string | null = null) {
  const r = await t.db.query<{ l: number; c: string; s: number }>(
    `SELECT locatie_id AS l, cont AS c, SUM(suma)::numeric AS s FROM miscari_bani
      WHERE $1::timestamptz IS NULL OR creata_la <= $1::timestamptz GROUP BY 1, 2`,
    [la],
  );
  return new Map(r.map((x) => [`${x.l}:${x.c}`, r2(x.s)]));
}

async function momenteDeVerificat(): Promise<(string | null)[]> {
  // Momente din tot istoricul: începutul, mijlocul, înaintea și după ultimele mișcări, plus „acum”.
  const [x] = await t.db.query<{ min: string; max: string }>('SELECT MIN(creata_la) AS min, MAX(creata_la) AS max FROM miscari_stoc');
  const min = Date.parse(x.min);
  const max = Date.parse(x.max);
  return [null, ...[0, 0.3, 0.5, 0.9, 0.999].map((f) => new Date(min + (max - min) * f).toISOString()), new Date(max + 60_000).toISOString()];
}

/** Toate citirile care folosesc soldurile închise, comparate cu suma registrului. */
async function verificaToate(eticheta: string) {
  const { depozit, centru, botanica } = t.demo.locatii;
  const locatii = [depozit, centru, botanica];
  const momente = await momenteDeVerificat();
  const nStoc = await inchisPana(t.db, STOC);
  const nBani = await inchisPana(t.db, BANI);

  for (const la of momente) {
    const brut = await brutStoc(la);
    // Subinterogarea generică, pe toate cheile.
    const rapid = await t.db.query<{ locatie_id: number; articol_id: number; sold: number }>(
      `SELECT * FROM ${sqlSold(STOC, { n: '$1::bigint', la: la ? '$2::timestamptz' : undefined })} s`,
      la ? [nStoc, la] : [nStoc],
    );
    expect(fara0(new Map(rapid.map((x) => [`${x.locatie_id}:${x.articol_id}`, r3(x.sold)]))), `${eticheta}: stoc la ${la}`).toEqual(fara0(brut));
    // stocLocatie (raportul de inventar, Stocuri pe o locație).
    for (const loc of locatii) {
      const rand = await stocLocatie(t.db, loc, la ?? undefined);
      for (const x of rand) expect(r3(x.stoc), `${eticheta}: stocLocatie ${loc}/${x.articol_id} la ${la}`).toBe(brut.get(`${loc}:${x.articol_id}`) ?? 0);
    }
    const bruti = await brutBani(la);
    const rapizi = await t.db.query<{ locatie_id: number; cont: string; sold: number }>(
      `SELECT * FROM ${sqlSold(BANI, { n: '$1::bigint', la: la ? '$2::timestamptz' : undefined })} s`,
      la ? [nBani, la] : [nBani],
    );
    expect(fara0(new Map(rapizi.map((x) => [`${x.locatie_id}:${x.cont}`, r2(x.sold)]))), `${eticheta}: bani la ${la}`).toEqual(fara0(bruti));
    for (const loc of locatii) {
      expect(await soldNumerar(t.db, loc, la ?? undefined), `${eticheta}: soldNumerar ${loc} la ${la}`).toBe(bruti.get(`${loc}:numerar`) ?? 0);
    }
  }

  const brut = await brutStoc();
  // Matricea din Stocuri: aceleași cifre și aceleași articole (active sau cu stoc nenul undeva).
  const matrice = await stocToateLocatiile(t.db);
  const articole = await t.db.query<{ id: number; activ: boolean }>('SELECT id, activ FROM articole');
  const asteptate = articole.filter((a) => a.activ || [...brut].some(([k, v]) => k.endsWith(`:${a.id}`) && v !== 0)).map((a) => a.id).sort();
  expect(matrice.articole.map((a: any) => a.id).sort(), `${eticheta}: articolele din matrice`).toEqual(asteptate);
  for (const a of matrice.articole as any[]) {
    for (const l of matrice.locatii) expect(r3(a.stocuri[l.id]), `${eticheta}: matrice ${a.id}/${l.id}`).toBe(brut.get(`${l.id}:${a.id}`) ?? 0);
  }

  // Panou: articolele sub prag.
  const subPragBrut = await t.db.query<{ locatie: string; nume: string; stoc: number }>(
    `SELECT l.nume AS locatie, a.nume, COALESCE(s.stoc, 0)::numeric AS stoc
       FROM articole a CROSS JOIN locatii l
       LEFT JOIN (SELECT locatie_id, articol_id, SUM(cantitate) AS stoc FROM miscari_stoc GROUP BY 1, 2) s ON s.articol_id = a.id AND s.locatie_id = l.id
      WHERE a.activ AND a.prag_minim > 0 AND l.activ AND l.tip = 'punct' AND COALESCE(s.stoc, 0) < a.prag_minim
      ORDER BY l.nume, a.nume LIMIT 100`,
  );
  const p = await panou(t.db, '2026-10-01T00:00:00Z');
  expect(p.sub_prag.map((x: any) => [x.locatie, x.nume, r3(x.stoc)]), `${eticheta}: sub prag`).toEqual(subPragBrut.map((x) => [x.locatie, x.nume, r3(x.stoc)]));

  // Bani: soldul de numerar din rezumat.
  const bruti = await brutBani();
  for (const x of (await rezumatBani(t.db, '2026-10-01T00:00:00Z', '2026-12-01T00:00:00Z')) as any[]) {
    expect(r2(x.sold_numerar), `${eticheta}: rezumat bani ${x.locatie_id}`).toBe(bruti.get(`${x.locatie_id}:numerar`) ?? 0);
  }

  // Fișa articolului: soldul după fiecare mișcare = suma cumulată în ordinea (dată, id).
  for (const nume of ['Lapte 3,2%', 'Cafea boabe', 'Pahar 350 ml']) {
    for (const loc of [depozit, centru]) {
      const art = t.idArticol(nume);
      const asteptat = await t.db.query<{ id: number; sold: number }>(
        `SELECT id, SUM(cantitate) OVER (ORDER BY creata_la, id)::numeric AS sold FROM miscari_stoc
          WHERE locatie_id = $1 AND articol_id = $2 ORDER BY creata_la DESC, id DESC LIMIT 40`,
        [loc, art],
      );
      const fisa = await fisaArticol(t.db, loc, art, 40);
      expect(fisa.map((x: any) => [Number(x.id), r3(x.sold)]), `${eticheta}: fișa ${nume}/${loc}`).toEqual(asteptat.map((x) => [Number(x.id), r3(x.sold)]));
    }
  }
}

/** Vânzări aleatoare (cu modificatori, card/numerar, casări) pe tura dată, la momentele date. */
function vanzari(tura: string, momente: string[]) {
  const produse = t.catalog.produse;
  return momente.map((la) => {
    const p = produse[Math.floor(rnd() * produse.length)];
    const metoda = rnd() < 0.1 ? 'casare' : rnd() < 0.5 ? 'card' : 'numerar';
    const linie = { produs_id: p.id, cantitate: 1 + Math.floor(rnd() * 3), pret_unitar: p.pret, modificatori: [] };
    return evComanda(tura, t.barista, [linie], metoda, { la, ...(metoda === 'casare' ? { motiv_casare: 'rebut' as const } : {}) });
  });
}

const minuteInUrma = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

describe('solduri închise', () => {
  it('fiecare citire dă exact suma registrului, oricând rulează închiderea', async () => {
    await verificaToate('fără sold închis');
    expect(await inchisPana(t.db, STOC)).toBe(0);

    const r1 = await inchideSolduri(t.db, { pastreazaMin: 0 });
    expect(r1.stoc).toBeGreaterThan(0);
    expect(r1.bani).toBeGreaterThan(0);
    await verificaToate('după prima închidere');

    // Vânzări noi, apoi o vânzare offline sincronizată târziu (dată cu 3 zile în urmă), o anulare cu
    // stoc restituit și o plată măruntă.
    const tura = randomUUID();
    const evs = [evTuraDeschisa(tura, t.barista, 0, minuteInUrma(300)), ...vanzari(tura, [280, 270, 260, 250].map(minuteInUrma))];
    expect((await t.tableta.sync(evs)).cu_eroare).toEqual([]);
    const deAnulat = evs[2] as ReturnType<typeof evComanda>;
    const tarzie = vanzari(tura, [new Date(Date.now() - 3 * 86_400_000).toISOString()]);
    const rest = [
      ...tarzie,
      { id: randomUUID(), tip: 'comanda_anulata', la: minuteInUrma(240), date: { comanda_id: deAnulat.date.comanda_id, tura_id: tura, utilizator_id: t.barista, motiv: 'greșeală', restituie_stoc: true } },
      { id: randomUUID(), tip: 'plata_marunta', la: minuteInUrma(235), date: { tura_id: tura, utilizator_id: t.barista, suma: 7, descriere: 'Șervețele' } },
    ];
    expect((await t.tableta.sync(rest)).cu_eroare).toEqual([]);
    await verificaToate('coadă cu mișcări întârziate și anulări');

    await inchideSolduri(t.db, { pastreazaMin: 0 });
    await verificaToate('după a doua închidere');

    // Recepție: costul mediu folosește stocul din toată rețeaua (sold închis + coadă).
    const { depozit, centru } = t.demo.locatii;
    const lapte = t.idArticol('Lapte 3,2%');
    const [{ s: retea }] = await t.db.query<{ s: number }>('SELECT SUM(cantitate)::numeric AS s FROM miscari_stoc WHERE articol_id = $1', [lapte]);
    const [{ cost_mediu: costVechi }] = await t.db.query<{ cost_mediu: number }>('SELECT cost_mediu FROM articole WHERE id = $1', [lapte]);
    await t.admin.post('/api/receptii', {
      locatie_id: depozit, furnizor: 'Lactate Nord', nr_factura: 'LN-1', data: '2026-10-22',
      linii: [{ articol_id: lapte, cantitate: 10000, cost_unitar: 0.03 }, { articol_id: t.idArticol('Cafea boabe'), cantitate: 1000, cost_unitar: 0.5 }],
      cheie: randomUUID(),
    });
    const [{ cost_mediu: costNou }] = await t.db.query<{ cost_mediu: number }>('SELECT cost_mediu FROM articole WHERE id = $1', [lapte]);
    const s = Math.max(0, retea);
    expect(costNou).toBeCloseTo((s * costVechi + 10000 * 0.03) / (s + 10000), 6);
    await t.admin.post('/api/transferuri', { din_locatie_id: depozit, in_locatie_id: centru, linii: [{ articol_id: lapte, cantitate: 3000 }] });
    await verificaToate('recepție și transfer în coadă');

    // Inventariere pe tabletă: numărare, o vânzare târzie datată înaintea numărării, apoi închidere.
    let raport = await t.tableta.post('/api/pos/inventarieri', { utilizator_id: t.barista });
    raport = await t.tableta.put(`/api/pos/inventarieri/${raport.id}/linii`, { linii: [{ articol_id: lapte, faptic: 1234 }, { articol_id: t.idArticol('Capac'), faptic: 7 }] });
    const verificaRaport = async (r: any, eticheta: string) => {
      for (const l of r.linii.filter((x: any) => x.faptic != null)) {
        const [{ s: brut }] = await t.db.query<{ s: number }>(
          'SELECT COALESCE(SUM(cantitate), 0)::numeric AS s FROM miscari_stoc WHERE locatie_id = $1 AND articol_id = $2 AND creata_la <= $3',
          [centru, l.articol_id, l.numarat_la],
        );
        expect(r3(l.scriptic), `${eticheta}: scriptic ${l.articol_id}`).toBe(r3(brut));
      }
    };
    await verificaRaport(raport, 'inventar deschis');
    expect((await t.tableta.sync(vanzari(tura, [minuteInUrma(30), minuteInUrma(20)]))).cu_eroare).toEqual([]);
    await inchideSolduri(t.db, { pastreazaMin: 0 });
    await verificaRaport(await t.tableta.get(`/api/pos/inventarieri/${raport.id}`), 'inventar deschis, după închidere');
    // O vânzare sincronizată după numărare, dar făcută înainte, în coadă (după soldul închis).
    expect((await t.tableta.sync(vanzari(tura, [minuteInUrma(10)]))).cu_eroare).toEqual([]);
    await verificaRaport(await t.tableta.get(`/api/pos/inventarieri/${raport.id}`), 'inventar deschis, vânzare târzie');
    const final = await t.tableta.post(`/api/pos/inventarieri/${raport.id}/finalizeaza`, {});
    expect(final.stare).toBe('finalizata');
    // După finalizare: stocul numărat = faptic la momentul numărării.
    for (const l of final.linii) {
      const [{ s }] = await t.db.query<{ s: number }>(
        'SELECT COALESCE(SUM(cantitate), 0)::numeric AS s FROM miscari_stoc WHERE locatie_id = $1 AND articol_id = $2 AND creata_la <= $3',
        [centru, l.articol_id, l.numarat_la],
      );
      expect(r3(s)).toBe(l.faptic);
    }
    // O vânzare datată înaintea numărării, sincronizată după finalizare: compensată pe inventariere.
    expect((await t.tableta.sync(vanzari(tura, [minuteInUrma(5)]))).cu_eroare).toEqual([]);
    await verificaToate('inventariere finalizată și compensări');
    await inchideSolduri(t.db, { pastreazaMin: 0 });
    await verificaToate('după ultima închidere');

    // Soldurile înlocuite se șterg: rămân cel mult ultimul mai vechi decât pragul și cele mai noi.
    for (const tabel of ['solduri_stoc', 'solduri_bani']) {
      const [{ n }] = await t.db.query<{ n: number }>(`SELECT COUNT(DISTINCT pana_la_id)::int AS n FROM ${tabel}`);
      expect(n, tabel).toBeLessThanOrEqual(2);
    }
  }, 180_000);

  it('o închidere fără mișcări noi nu inserează nimic și păstrează soldul implicit o oră', async () => {
    await inchideSolduri(t.db);
    const inainte = await t.db.query('SELECT COUNT(*)::int AS n FROM solduri_stoc');
    expect(await inchideSolduri(t.db)).toEqual({ stoc: null, bani: null });
    expect(await t.db.query('SELECT COUNT(*)::int AS n FROM solduri_stoc')).toEqual(inainte);
    // Cu păstrarea implicită (60 min) nu se șterge nimic din ce s-a închis acum.
    const tura = randomUUID();
    expect((await t.tableta.sync([evTuraDeschisa(tura, t.barista, 0, minuteInUrma(3)), ...vanzari(tura, [minuteInUrma(2)])])).cu_eroare).toEqual([]);
    const [{ n: inainteDistincte }] = await t.db.query<{ n: number }>('SELECT COUNT(DISTINCT pana_la_id)::int AS n FROM solduri_stoc');
    await inchideSolduri(t.db);
    const [{ n: dupaDistincte }] = await t.db.query<{ n: number }>('SELECT COUNT(DISTINCT pana_la_id)::int AS n FROM solduri_stoc');
    expect(dupaDistincte).toBe(inainteDistincte + 1);
  }, 60_000);
});

describe('recepții și transferuri cu cheie de idempotență', () => {
  it('a doua salvare cu aceeași cheie întoarce documentul existent fără să atingă stocul sau costul', async () => {
    const { depozit, botanica } = t.demo.locatii;
    const sirop = t.idArticol('Sirop vanilie');
    const stoc = async (loc: number) => (await t.db.query<{ s: number }>('SELECT COALESCE(SUM(cantitate), 0)::numeric AS s FROM miscari_stoc WHERE locatie_id = $1 AND articol_id = $2', [loc, sirop]))[0].s;
    const cost = async () => (await t.db.query<{ c: number }>('SELECT cost_mediu AS c FROM articole WHERE id = $1', [sirop]))[0].c;

    const cheie = randomUUID();
    const factura = { locatie_id: depozit, furnizor: 'Siropuri SRL', nr_factura: 'S-77', data: '2026-10-22', linii: [{ articol_id: sirop, cantitate: 500, cost_unitar: 0.4 }], cheie };
    const intai = await t.admin.post('/api/receptii', factura);
    expect(intai.repetata).toBe(false);
    const stocDupa = await stoc(depozit);
    const costDupa = await cost();
    // Răspunsul s-a pierdut, adminul apasă din nou (de două ori, simultan).
    const [doi, trei] = await Promise.all([t.admin.post('/api/receptii', factura), t.admin.post('/api/receptii', factura)]);
    expect([doi.id, trei.id]).toEqual([intai.id, intai.id]);
    expect(doi.repetata && trei.repetata).toBe(true);
    expect(await stoc(depozit)).toBe(stocDupa);
    expect(await cost()).toBe(costDupa);
    expect((await t.db.query('SELECT 1 FROM receptii WHERE cheie = $1', [cheie])).length).toBe(1);
    // Fără cheie (clienți vechi) fiecare salvare creează o recepție, ca până acum.
    const faraCheie = { ...factura, cheie: undefined, nr_factura: 'S-78' };
    const a = await t.admin.post('/api/receptii', faraCheie);
    const b = await t.admin.post('/api/receptii', faraCheie);
    expect(a.id).not.toBe(b.id);

    const cheieT = randomUUID();
    const transfer = { din_locatie_id: depozit, in_locatie_id: botanica, linii: [{ articol_id: sirop, cantitate: 100 }], cheie: cheieT };
    const t1 = await t.admin.post('/api/transferuri', transfer);
    const inBotanica = await stoc(botanica);
    const t2 = await t.admin.post('/api/transferuri', transfer);
    expect(t2).toMatchObject({ id: t1.id, repetat: true });
    expect(await stoc(botanica)).toBe(inBotanica);
    // O cheie care nu e UUID e respinsă de validare.
    const r = await t.app.inject({ method: 'POST', url: '/api/transferuri', payload: { ...transfer, cheie: 'x' }, headers: { authorization: `Bearer ${t.tokenAdmin}` } });
    expect(r.statusCode).toBe(400);
  });

  it('recepția blochează articolele în ordinea id-ului, fără să oprească vânzările (FOR NO KEY UPDATE)', async () => {
    // Pe PGlite (o singură conexiune) se verifică doar că recepția cu linii în ordine inversă reușește;
    // blocarea reală între conexiuni e acoperită de testul pe PostgreSQL (blocari.test.ts).
    const { depozit } = t.demo.locatii;
    const ids = (await t.db.query<{ id: number }>('SELECT id FROM articole WHERE activ ORDER BY id DESC LIMIT 5')).map((x) => x.id);
    const r = await t.admin.post('/api/receptii', {
      locatie_id: depozit, furnizor: 'Diverse', nr_factura: 'D-1', data: '2026-10-22',
      linii: ids.map((id) => ({ articol_id: id, cantitate: 10, cost_unitar: 1 })), cheie: randomUUID(),
    });
    expect(r.id).toBeGreaterThan(0);
  });
});
