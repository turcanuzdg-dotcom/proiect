import type { TipMiscareStoc } from '@cafenea/shared';
import { insereaza, type Db } from '../db';
import { inchisPana, sqlSold, STOC } from './solduri';

export interface Miscare {
  locatie_id: number;
  articol_id: number;
  cantitate: number;
  tip: TipMiscareStoc;
  document_tip: string;
  document_id: string | number;
  cost_unitar: number;
  creata_la?: string | Date;
}

/** Cheia blocării stocului unei locații (ordinea blocărilor: vezi CHEIE_CASA în ture.ts). */
export const CHEIE_STOC = 7301;
const COLOANE = ['locatie_id', 'articol_id', 'cantitate', 'tip', 'document_tip', 'document_id', 'cost_unitar', 'creata_la'];

/** Cheia stocului, partajat, pentru fiecare locație o singură dată și în ordine crescătoare. */
export async function blocheazaStoc(db: Db, locatii: number[]): Promise<void> {
  for (const loc of [...new Set(locatii)].sort((a, b) => a - b)) {
    await db.query('SELECT pg_advisory_xact_lock_shared($1, $2)', [CHEIE_STOC, loc]);
  }
}

export async function inregistreazaMiscari(db: Db, miscari: Miscare[]): Promise<void> {
  const acum = new Date().toISOString();
  const reale = miscari
    .filter((m) => m.cantitate !== 0)
    .map((m) => ({ ...m, creata_la: m.creata_la ? new Date(m.creata_la).toISOString() : acum }));
  // Finalizarea unei inventarieri a locației ia aceeași cheie, exclusiv: o mișcare scrisă în paralel
  // fie e văzută de finalizare (în scripticul înghețat), fie vede inventarierea finalizată și se compensează.
  await blocheazaStoc(db, reale.map((m) => m.locatie_id));
  const randuri = reale.map((m) => [m.locatie_id, m.articol_id, m.cantitate, m.tip, m.document_tip, String(m.document_id), m.cost_unitar, m.creata_la]);
  randuri.push(...(await compensariInventar(db, reale)));
  await insereaza(db, 'miscari_stoc', COLOANE, randuri);
}

/**
 * O mișcare datată înaintea unei numărări deja finalizate (vânzare offline sincronizată a doua zi,
 * eveniment reaplicat de admin) era deja cuprinsă în cantitatea numărată fizic, dar nu și în
 * scripticul înghețat la finalizare: ajustarea a scăzut-o o dată ca „lipsă”, iar mișcarea ar
 * scădea-o a doua oară. Compensăm pe inventariere, la momentul numărării, ca stocul să rămână
 * faptic + ce s-a mișcat după numărare, iar lipsa raportată să fie cea reală.
 */
async function compensariInventar(db: Db, miscari: (Miscare & { creata_la: string })[]): Promise<(string | number)[][]> {
  const candidate = miscari.filter((m) => m.tip !== 'inventar');
  if (!candidate.length) return [];
  const r = await db.query<{ idx: number; inventariere_id: number; numarat_la: string }>(
    `SELECT x.idx::int AS idx, il.inventariere_id, il.numarat_la
       FROM unnest($1::int[], $2::int[], $3::timestamptz[]) WITH ORDINALITY AS x(locatie_id, articol_id, la, idx)
       JOIN LATERAL (
         SELECT il.inventariere_id, il.numarat_la
           FROM inventarieri_linii il JOIN inventarieri i ON i.id = il.inventariere_id
          WHERE i.locatie_id = x.locatie_id AND il.articol_id = x.articol_id AND i.stare = 'finalizata'
            AND il.numarat_la > x.la
          ORDER BY il.numarat_la LIMIT 1
       ) il ON true`,
    [candidate.map((m) => m.locatie_id), candidate.map((m) => m.articol_id), candidate.map((m) => m.creata_la)],
  );
  return r.map((x) => {
    const m = candidate[x.idx - 1];
    return [m.locatie_id, m.articol_id, -m.cantitate, 'inventar', 'inventariere', String(x.inventariere_id), m.cost_unitar, new Date(x.numarat_la).toISOString()];
  });
}

export async function costuriMedii(db: Db): Promise<Map<number, number>> {
  const r = await db.query<{ id: number; cost_mediu: number }>('SELECT id, cost_mediu FROM articole');
  return new Map(r.map((x) => [x.id, x.cost_mediu]));
}

export interface RandStoc {
  articol_id: number;
  nume: string;
  um: string;
  tip: string;
  activ: boolean;
  prag_minim: number;
  cost_mediu: number;
  stoc: number;
  valoare: number;
  sub_prag: boolean;
}

/**
 * Stocul scriptic al unei locații, acum sau la un moment dat.
 * Un articol dezactivat rămâne vizibil cât timp mai are stoc (sau a ajuns pe minus).
 */
export async function stocLocatie(db: Db, locatieId: number, la?: string | Date): Promise<RandStoc[]> {
  const r = await db.query<Omit<RandStoc, 'valoare' | 'sub_prag'>>(
    `SELECT a.id AS articol_id, a.nume, a.um, a.tip, a.activ, a.prag_minim, a.cost_mediu,
            COALESCE(s.sold, 0)::numeric AS stoc
       FROM articole a
       LEFT JOIN ${sqlSold(STOC, { n: '$2::bigint', locatie: '$1::int', la: la ? '$3::timestamptz' : undefined })} s ON s.articol_id = a.id
      WHERE a.activ OR COALESCE(s.sold, 0) <> 0
      ORDER BY a.tip, a.nume`,
    [locatieId, await inchisPana(db, STOC), ...(la ? [new Date(la).toISOString()] : [])],
  );
  return r.map((x) => ({
    ...x,
    valoare: Math.round(x.stoc * x.cost_mediu * 100) / 100,
    sub_prag: x.activ && x.prag_minim > 0 && x.stoc < x.prag_minim,
  }));
}

/** Matricea articol × locație pentru panoul de stocuri. */
export async function stocToateLocatiile(db: Db) {
  const locatii = await db.query<{ id: number; nume: string; tip: string }>(
    'SELECT id, nume, tip FROM locatii WHERE activ ORDER BY tip, id',
  );
  const r = await db.query<{ articol_id: number; locatie_id: number; stoc: number }>(
    `SELECT articol_id, locatie_id, sold::numeric AS stoc FROM ${sqlSold(STOC, { n: '$1::bigint' })} s`,
    [await inchisPana(db, STOC)],
  );
  const articole = await db.query<{ id: number; activ: boolean }>(
    'SELECT a.id, a.nume, a.um, a.tip, a.activ, a.prag_minim, a.cost_mediu FROM articole a ORDER BY a.tip, a.nume',
  );
  const harta = new Map<string, number>();
  // Un articol dezactivat apare cât timp are stoc nenul în vreo locație, inclusiv într-una inactivă.
  const cuStoc = new Set<number>();
  for (const x of r) {
    harta.set(`${x.articol_id}:${x.locatie_id}`, x.stoc);
    if (x.stoc !== 0) cuStoc.add(x.articol_id);
  }
  return {
    locatii,
    articole: articole
      .filter((a) => a.activ || cuStoc.has(a.id))
      .map((a) => ({
        ...a,
        stocuri: Object.fromEntries(locatii.map((l) => [l.id, harta.get(`${a.id}:${l.id}`) ?? 0])),
      })),
  };
}

/**
 * Ultimele mișcări ale articolului, cu soldul după fiecare. Se citesc doar ultimele `limita` rânduri
 * (prin indexul locație–articol–dată); soldul după un rând = stocul de acum minus ce s-a mișcat după
 * el, în aceeași ordine (dată, id), deci nu mai e nevoie de suma cumulată peste tot istoricul.
 */
export async function fisaArticol(db: Db, locatieId: number, articolId: number, limita = 200) {
  return db.query(
    `WITH ultime AS (
       SELECT id, cantitate, tip, document_tip, document_id, cost_unitar, creata_la
         FROM miscari_stoc WHERE locatie_id = $1 AND articol_id = $2
        ORDER BY creata_la DESC, id DESC LIMIT $3)
     SELECT u.*,
            COALESCE((SELECT s.sold FROM ${sqlSold(STOC, { n: '$4::bigint', locatie: '$1', dupa: '= $2' })} s), 0)
              - COALESCE(SUM(u.cantitate) OVER (ORDER BY u.creata_la DESC, u.id DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS sold
       FROM ultime u
      ORDER BY u.creata_la DESC, u.id DESC`,
    [locatieId, articolId, limita, await inchisPana(db, STOC)],
  );
}
