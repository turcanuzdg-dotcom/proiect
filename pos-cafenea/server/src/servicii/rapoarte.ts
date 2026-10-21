import {
  ETICHETE_MOTIVE,
  inUnitateMare,
  procent,
  rotunjeste,
  type MotivCasare,
  type RandComparatie,
  type RandVanzari,
  type UM,
} from '@cafenea/shared';
import type { Db } from '../db';

export interface Interval {
  de: string;
  pana: string;
  locatie_id?: number | null;
}

export type Grupare = 'produs' | 'categorie';

/** Vânzări reale (fără casări și anulări), cu costul ingredientelor din momentul vânzării. */
export async function raportVanzari(db: Db, i: Interval, grupare: Grupare = 'produs'): Promise<RandVanzari[]> {
  const cheie = grupare === 'produs' ? 'p.id' : `COALESCE(cat.id, 0)`;
  const nume = grupare === 'produs' ? 'p.nume' : `COALESCE(cat.nume, 'Fără categorie')`;
  const r = await db.query<{ cheie: string; nume: string; cantitate: number; incasari: number; cost: number }>(
    `SELECT ${cheie}::text AS cheie, ${nume} AS nume,
            SUM(cl.cantitate)::numeric AS cantitate, SUM(cl.total)::numeric AS incasari, SUM(cl.cost)::numeric AS cost
       FROM comenzi c
       JOIN comenzi_linii cl ON cl.comanda_id = c.id
       JOIN produse p ON p.id = cl.produs_id
       LEFT JOIN categorii cat ON cat.id = p.categorie_id
      WHERE c.stare = 'finalizata' AND c.metoda <> 'casare'
        AND c.creata_la >= $1 AND c.creata_la < $2
        AND ($3::int IS NULL OR c.locatie_id = $3)
      GROUP BY 1, 2
      ORDER BY 4 DESC`,
    [i.de, i.pana, i.locatie_id ?? null],
  );
  return r.map((x) => {
    const marja = rotunjeste(x.incasari - x.cost);
    return {
      cheie: x.cheie,
      nume: x.nume,
      cantitate: x.cantitate,
      incasari: rotunjeste(x.incasari),
      cost: rotunjeste(x.cost),
      marja,
      marja_procent: procent(marja, x.incasari),
    };
  });
}

/** Încasări pe zile, pentru grafic. */
export async function serieZilnica(db: Db, i: Interval, fus = 'Europe/Chisinau') {
  return db.query<{ zi: string; incasari: number; comenzi: number }>(
    `SELECT to_char(c.creata_la AT TIME ZONE $4, 'YYYY-MM-DD') AS zi,
            SUM(c.total)::numeric AS incasari, COUNT(*)::int AS comenzi
       FROM comenzi c
      WHERE c.stare = 'finalizata' AND c.metoda <> 'casare'
        AND c.creata_la >= $1 AND c.creata_la < $2
        AND ($3::int IS NULL OR c.locatie_id = $3)
      GROUP BY 1 ORDER BY 1`,
    [i.de, i.pana, i.locatie_id ?? null, fus],
  );
}

/** Perioada A față de perioada B (de ex. Iced Coffee în iulie vs. august). */
export async function comparaPerioade(
  db: Db,
  a: Interval,
  b: Interval,
  grupare: Grupare = 'produs',
): Promise<{ randuri: RandComparatie[]; total_a: number; total_b: number }> {
  const [ra, rb] = await Promise.all([raportVanzari(db, a, grupare), raportVanzari(db, b, grupare)]);
  const chei = new Map<string, string>();
  for (const x of [...ra, ...rb]) chei.set(x.cheie, x.nume);
  const ha = new Map(ra.map((x) => [x.cheie, x]));
  const hb = new Map(rb.map((x) => [x.cheie, x]));
  const randuri = [...chei].map(([cheie, nume]) => {
    const x = ha.get(cheie);
    const y = hb.get(cheie);
    const a_incasari = x?.incasari ?? 0;
    const b_incasari = y?.incasari ?? 0;
    return {
      cheie,
      nume,
      a_cantitate: x?.cantitate ?? 0,
      a_incasari,
      b_cantitate: y?.cantitate ?? 0,
      b_incasari,
      dif_cantitate: (y?.cantitate ?? 0) - (x?.cantitate ?? 0),
      dif_incasari: rotunjeste(b_incasari - a_incasari),
      dif_procent: procent(b_incasari - a_incasari, a_incasari),
    };
  });
  randuri.sort((p, q) => Math.max(q.a_incasari, q.b_incasari) - Math.max(p.a_incasari, p.b_incasari));
  return {
    randuri,
    total_a: rotunjeste(ra.reduce((s, x) => s + x.incasari, 0)),
    total_b: rotunjeste(rb.reduce((s, x) => s + x.incasari, 0)),
  };
}

/**
 * Consumul de materie primă pe locații: ce s-a scos din stoc prin vânzări și casări
 * (minus ce a revenit prin anulări), afișat în kg / l / buc.
 */
export async function raportConsum(db: Db, i: Interval) {
  const r = await db.query<{ locatie_id: number; locatie: string; articol_id: number; nume: string; um: UM; tip: string; vanzari: number; casari: number; retur: number; valoare: number }>(
    `SELECT l.id AS locatie_id, l.nume AS locatie, a.id AS articol_id, a.nume, a.um, a.tip,
            COALESCE(-SUM(m.cantitate) FILTER (WHERE m.tip = 'vanzare'), 0)::numeric AS vanzari,
            COALESCE(-SUM(m.cantitate) FILTER (WHERE m.tip = 'casare'), 0)::numeric AS casari,
            COALESCE(SUM(m.cantitate) FILTER (WHERE m.tip = 'retur'), 0)::numeric AS retur,
            COALESCE(-SUM(m.cantitate * m.cost_unitar), 0)::numeric AS valoare
       FROM miscari_stoc m
       JOIN articole a ON a.id = m.articol_id
       JOIN locatii l ON l.id = m.locatie_id
      WHERE m.tip IN ('vanzare', 'casare', 'retur')
        AND m.creata_la >= $1 AND m.creata_la < $2
        AND ($3::int IS NULL OR m.locatie_id = $3)
      GROUP BY l.id, a.id
      ORDER BY l.id, a.tip, a.nume`,
    [i.de, i.pana, i.locatie_id ?? null],
  );
  return r.map((x) => {
    const total = x.vanzari + x.casari - x.retur;
    const mare = inUnitateMare(total, x.um);
    return {
      ...x,
      total,
      total_afisat: mare.cantitate,
      um_afisat: mare.um,
      valoare: rotunjeste(x.valoare),
    };
  });
}

/** Pierderi: casări pe motive, anulări fără restituire, minusuri și plusuri la inventariere, diferențe de casă. */
export async function raportPierderi(db: Db, i: Interval) {
  const p = [i.de, i.pana, i.locatie_id ?? null];
  const casari = await db.query<{ motiv: MotivCasare; produse: number; valoare_cost: number; valoare_vanzare: number }>(
    `SELECT c.motiv_casare AS motiv, SUM(cl.cantitate)::int AS produse,
            SUM(cl.cost)::numeric AS valoare_cost, SUM(cl.total)::numeric AS valoare_vanzare
       FROM comenzi c JOIN comenzi_linii cl ON cl.comanda_id = c.id
      WHERE c.metoda = 'casare' AND c.stare = 'finalizata'
        AND c.creata_la >= $1 AND c.creata_la < $2 AND ($3::int IS NULL OR c.locatie_id = $3)
      GROUP BY 1 ORDER BY 3 DESC`,
    p,
  );
  const casariProduse = await db.query(
    `SELECT pr.nume, c.motiv_casare AS motiv, SUM(cl.cantitate)::int AS cantitate, SUM(cl.cost)::numeric AS valoare_cost
       FROM comenzi c JOIN comenzi_linii cl ON cl.comanda_id = c.id JOIN produse pr ON pr.id = cl.produs_id
      WHERE c.metoda = 'casare' AND c.stare = 'finalizata'
        AND c.creata_la >= $1 AND c.creata_la < $2 AND ($3::int IS NULL OR c.locatie_id = $3)
      GROUP BY 1, 2 ORDER BY 4 DESC LIMIT 50`,
    p,
  );
  const anulari = await db.query<{ restituit: boolean; comenzi: number; valoare_vanzare: number; valoare_cost: number }>(
    `SELECT COALESCE(c.stoc_restituit, false) AS restituit, COUNT(DISTINCT c.id)::int AS comenzi,
            SUM(cl.total)::numeric AS valoare_vanzare, SUM(cl.cost)::numeric AS valoare_cost
       FROM comenzi c JOIN comenzi_linii cl ON cl.comanda_id = c.id
      WHERE c.stare = 'anulata' AND c.anulata_la >= $1 AND c.anulata_la < $2 AND ($3::int IS NULL OR c.locatie_id = $3)
      GROUP BY 1`,
    p,
  );
  const inventar = await db.query<{ nume: string; um: UM; cantitate: number; valoare: number }>(
    `SELECT a.nume, a.um, SUM(m.cantitate)::numeric AS cantitate, SUM(m.cantitate * m.cost_unitar)::numeric AS valoare
       FROM miscari_stoc m JOIN articole a ON a.id = m.articol_id
      WHERE m.tip = 'inventar' AND m.creata_la >= $1 AND m.creata_la < $2 AND ($3::int IS NULL OR m.locatie_id = $3)
      GROUP BY a.id ORDER BY 4`,
    p,
  );
  const casa = await db.query<{ minus: number; plus: number }>(
    `SELECT COALESCE(SUM(suma) FILTER (WHERE suma < 0), 0)::numeric AS minus,
            COALESCE(SUM(suma) FILTER (WHERE suma > 0), 0)::numeric AS plus
       FROM miscari_bani m
      WHERE m.tip = 'diferenta_casa'
        AND m.creata_la >= $1 AND m.creata_la < $2 AND ($3::int IS NULL OR m.locatie_id = $3)`,
    p,
  );
  const anulareFaraRestituire = anulari.find((a) => !a.restituit);
  const minusInventar = inventar.filter((x) => x.valoare < 0).reduce((s, x) => s + x.valoare, 0);
  const totalCasari = casari.reduce((s, x) => s + x.valoare_cost, 0);
  return {
    casari: casari.map((x) => ({ ...x, eticheta: ETICHETE_MOTIVE[x.motiv] ?? x.motiv, valoare_cost: rotunjeste(x.valoare_cost), valoare_vanzare: rotunjeste(x.valoare_vanzare) })),
    casari_produse: casariProduse,
    anulari,
    inventar: inventar.map((x) => ({ ...x, valoare: rotunjeste(x.valoare) })),
    casa: casa[0],
    total_pierderi_cost: rotunjeste(totalCasari + (anulareFaraRestituire?.valoare_cost ?? 0) + Math.abs(minusInventar)),
  };
}
