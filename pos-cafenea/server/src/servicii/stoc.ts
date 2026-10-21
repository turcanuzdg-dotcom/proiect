import type { TipMiscareStoc } from '@cafenea/shared';
import { insereaza, type Db } from '../db';

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

export async function inregistreazaMiscari(db: Db, miscari: Miscare[]): Promise<void> {
  const randuri = miscari
    .filter((m) => m.cantitate !== 0)
    .map((m) => [
      m.locatie_id,
      m.articol_id,
      m.cantitate,
      m.tip,
      m.document_tip,
      String(m.document_id),
      m.cost_unitar,
      m.creata_la ? new Date(m.creata_la).toISOString() : new Date().toISOString(),
    ]);
  await insereaza(
    db,
    'miscari_stoc',
    ['locatie_id', 'articol_id', 'cantitate', 'tip', 'document_tip', 'document_id', 'cost_unitar', 'creata_la'],
    randuri,
  );
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
  prag_minim: number;
  cost_mediu: number;
  stoc: number;
  valoare: number;
  sub_prag: boolean;
}

/** Stocul scriptic al unei locații, acum sau la un moment dat (pentru inventariere). */
export async function stocLocatie(db: Db, locatieId: number, la?: string | Date): Promise<RandStoc[]> {
  const r = await db.query<Omit<RandStoc, 'valoare' | 'sub_prag'>>(
    `SELECT a.id AS articol_id, a.nume, a.um, a.tip, a.prag_minim, a.cost_mediu,
            COALESCE(SUM(m.cantitate), 0)::numeric AS stoc
       FROM articole a
       LEFT JOIN miscari_stoc m
         ON m.articol_id = a.id AND m.locatie_id = $1
        AND ($2::timestamptz IS NULL OR m.creata_la <= $2::timestamptz)
      WHERE a.activ
      GROUP BY a.id
      ORDER BY a.tip, a.nume`,
    [locatieId, la ? new Date(la).toISOString() : null],
  );
  return r.map((x) => ({
    ...x,
    valoare: Math.round(x.stoc * x.cost_mediu * 100) / 100,
    sub_prag: x.prag_minim > 0 && x.stoc < x.prag_minim,
  }));
}

/** Matricea articol × locație pentru panoul de stocuri. */
export async function stocToateLocatiile(db: Db) {
  const locatii = await db.query<{ id: number; nume: string; tip: string }>(
    'SELECT id, nume, tip FROM locatii WHERE activ ORDER BY tip, id',
  );
  const r = await db.query<{ articol_id: number; locatie_id: number; stoc: number }>(
    `SELECT articol_id, locatie_id, SUM(cantitate)::numeric AS stoc
       FROM miscari_stoc GROUP BY articol_id, locatie_id`,
  );
  const articole = await db.query(
    'SELECT id, nume, um, tip, prag_minim, cost_mediu FROM articole WHERE activ ORDER BY tip, nume',
  );
  const harta = new Map<string, number>();
  for (const x of r) harta.set(`${x.articol_id}:${x.locatie_id}`, x.stoc);
  return {
    locatii,
    articole: articole.map((a: any) => ({
      ...a,
      stocuri: Object.fromEntries(locatii.map((l) => [l.id, harta.get(`${a.id}:${l.id}`) ?? 0])),
    })),
  };
}

export async function fisaArticol(db: Db, locatieId: number, articolId: number, limita = 200) {
  return db.query(
    `SELECT id, cantitate, tip, document_tip, document_id, cost_unitar, creata_la,
            SUM(cantitate) OVER (ORDER BY creata_la, id) AS sold
       FROM miscari_stoc
      WHERE locatie_id = $1 AND articol_id = $2
      ORDER BY creata_la DESC, id DESC
      LIMIT $3`,
    [locatieId, articolId, limita],
  );
}
