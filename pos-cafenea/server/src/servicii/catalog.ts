import { createHash } from 'node:crypto';
import type { CatalogPOS, DefinitieModificator, LinieReteta, TipArticol, UM } from '@cafenea/shared';
import { insereaza, type Db } from '../db';
import { EroareNegasit, EroareUtilizator } from '../erori';

// ---- Articole (materie primă, ambalaje, mărfuri) ----

export interface DateArticol {
  nume: string;
  um: UM;
  tip: TipArticol;
  prag_minim?: number;
  activ?: boolean;
}

export function listaArticole(db: Db) {
  return db.query('SELECT * FROM articole ORDER BY activ DESC, tip, nume');
}

export async function salveazaArticol(db: Db, d: DateArticol, id?: number) {
  if (id) {
    const r = await db.query(
      `UPDATE articole SET nume = $2, um = $3, tip = $4, prag_minim = $5, activ = $6 WHERE id = $1 RETURNING *`,
      [id, d.nume, d.um, d.tip, d.prag_minim ?? 0, d.activ ?? true],
    );
    if (!r[0]) throw new EroareNegasit('Articolul');
    return r[0];
  }
  const r = await db.query(
    `INSERT INTO articole (nume, um, tip, prag_minim, activ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [d.nume, d.um, d.tip, d.prag_minim ?? 0, d.activ ?? true],
  );
  return r[0];
}

// ---- Categorii ----

export function listaCategorii(db: Db) {
  return db.query('SELECT * FROM categorii ORDER BY ordine, nume');
}

export async function salveazaCategorie(db: Db, d: { nume: string; ordine?: number }, id?: number) {
  if (id) {
    const r = await db.query('UPDATE categorii SET nume = $2, ordine = $3 WHERE id = $1 RETURNING *', [id, d.nume, d.ordine ?? 0]);
    if (!r[0]) throw new EroareNegasit('Categoria');
    return r[0];
  }
  return (await db.query('INSERT INTO categorii (nume, ordine) VALUES ($1, $2) RETURNING *', [d.nume, d.ordine ?? 0]))[0];
}

// ---- Produse și rețete ----

export interface DateProdus {
  nume: string;
  categorie_id: number | null;
  pret: number;
  doze_cafea?: number;
  ordine?: number;
  activ?: boolean;
  /** Litera cotei de TVA de pe casa fiscală; lipsă = cea implicită din setări. */
  cota_tva?: string | null;
  reteta: LinieReteta[];
  modificatori: number[];
}

export async function listaProduse(db: Db) {
  const produse = await db.query('SELECT * FROM produse ORDER BY activ DESC, ordine, nume');
  const retete = await db.query<{ produs_id: number; articol_id: number; cantitate: number }>(
    'SELECT produs_id, articol_id, cantitate FROM retete',
  );
  const mods = await db.query<{ produs_id: number; modificator_id: number }>('SELECT * FROM produse_modificatori');
  const costuri = new Map(
    (await db.query<{ id: number; cost_mediu: number }>('SELECT id, cost_mediu FROM articole')).map((a) => [a.id, a.cost_mediu]),
  );
  return produse.map((p: any) => {
    const reteta = retete.filter((r) => r.produs_id === p.id).map(({ articol_id, cantitate }) => ({ articol_id, cantitate }));
    const cost = reteta.reduce((s, l) => s + l.cantitate * (costuri.get(l.articol_id) ?? 0), 0);
    return {
      ...p,
      reteta,
      modificatori: mods.filter((m) => m.produs_id === p.id).map((m) => m.modificator_id),
      cost_reteta: Math.round(cost * 100) / 100,
    };
  });
}

export async function salveazaProdus(db: Db, d: DateProdus, id?: number) {
  if (d.reteta.length === 0) throw new EroareUtilizator('Produsul trebuie să aibă cel puțin un ingredient în rețetă');
  return db.tx(async (t) => {
    let produsId = id;
    if (id) {
      const r = await t.query(
        `UPDATE produse SET nume = $2, categorie_id = $3, pret = $4, doze_cafea = $5, ordine = $6, activ = $7, cota_tva = $8
          WHERE id = $1 RETURNING id`,
        [id, d.nume, d.categorie_id, d.pret, d.doze_cafea ?? 0, d.ordine ?? 0, d.activ ?? true, d.cota_tva || null],
      );
      if (!r[0]) throw new EroareNegasit('Produsul');
      await t.query('DELETE FROM retete WHERE produs_id = $1', [id]);
      await t.query('DELETE FROM produse_modificatori WHERE produs_id = $1', [id]);
    } else {
      const r = await t.query(
        `INSERT INTO produse (nume, categorie_id, pret, doze_cafea, ordine, activ, cota_tva) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [d.nume, d.categorie_id, d.pret, d.doze_cafea ?? 0, d.ordine ?? 0, d.activ ?? true, d.cota_tva || null],
      );
      produsId = r[0].id;
    }
    await insereaza(t, 'retete', ['produs_id', 'articol_id', 'cantitate'], comaseaza(d.reteta).map((l) => [produsId, l.articol_id, l.cantitate]));
    await insereaza(t, 'produse_modificatori', ['produs_id', 'modificator_id'], [...new Set(d.modificatori)].map((m) => [produsId, m]));
    return { id: produsId };
  });
}

function comaseaza(linii: LinieReteta[]): LinieReteta[] {
  const m = new Map<number, number>();
  for (const l of linii) m.set(l.articol_id, (m.get(l.articol_id) ?? 0) + l.cantitate);
  return [...m].map(([articol_id, cantitate]) => ({ articol_id, cantitate }));
}

// ---- Modificatori ----

export interface DateModificator {
  nume: string;
  pret: number;
  doze_cafea?: number;
  inlocuieste_articol_id?: number | null;
  inlocuitor_articol_id?: number | null;
  adauga: LinieReteta[];
  activ?: boolean;
}

export async function listaModificatori(db: Db): Promise<(DefinitieModificator & { activ: boolean })[]> {
  const mods = await db.query('SELECT * FROM modificatori ORDER BY activ DESC, nume');
  const linii = await db.query<{ modificator_id: number; articol_id: number; cantitate: number }>('SELECT * FROM modificatori_linii');
  return mods.map((m: any) => ({
    ...m,
    adauga: linii.filter((l) => l.modificator_id === m.id).map(({ articol_id, cantitate }) => ({ articol_id, cantitate })),
  }));
}

export async function salveazaModificator(db: Db, d: DateModificator, id?: number) {
  const inl = d.inlocuieste_articol_id ?? null;
  const cu = d.inlocuitor_articol_id ?? null;
  if ((inl == null) !== (cu == null)) throw new EroareUtilizator('Înlocuirea are nevoie de ambele articole (ce se înlocuiește și cu ce)');
  return db.tx(async (t) => {
    let modId = id;
    if (id) {
      const r = await t.query(
        `UPDATE modificatori SET nume = $2, pret = $3, doze_cafea = $4, inlocuieste_articol_id = $5,
                inlocuitor_articol_id = $6, activ = $7 WHERE id = $1 RETURNING id`,
        [id, d.nume, d.pret, d.doze_cafea ?? 0, inl, cu, d.activ ?? true],
      );
      if (!r[0]) throw new EroareNegasit('Modificatorul');
      await t.query('DELETE FROM modificatori_linii WHERE modificator_id = $1', [id]);
    } else {
      const r = await t.query(
        `INSERT INTO modificatori (nume, pret, doze_cafea, inlocuieste_articol_id, inlocuitor_articol_id, activ)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [d.nume, d.pret, d.doze_cafea ?? 0, inl, cu, d.activ ?? true],
      );
      modId = r[0].id;
    }
    await insereaza(t, 'modificatori_linii', ['modificator_id', 'articol_id', 'cantitate'], comaseaza(d.adauga).map((l) => [modId, l.articol_id, l.cantitate]));
    return { id: modId };
  });
}

// ---- Date pentru descărcarea din stoc ----

export interface DefinitieProdus {
  id: number;
  nume: string;
  doze_cafea: number;
  reteta: LinieReteta[];
}

export async function incarcaDefinitii(db: Db, produseIds: number[], modificatoriIds: number[]) {
  const produse = new Map<number, DefinitieProdus>();
  if (produseIds.length) {
    const p = await db.query<{ id: number; nume: string; doze_cafea: number }>(
      'SELECT id, nume, doze_cafea FROM produse WHERE id = ANY($1::int[])',
      [produseIds],
    );
    for (const x of p) produse.set(x.id, { ...x, reteta: [] });
    const r = await db.query<{ produs_id: number; articol_id: number; cantitate: number }>(
      'SELECT produs_id, articol_id, cantitate FROM retete WHERE produs_id = ANY($1::int[])',
      [produseIds],
    );
    for (const l of r) produse.get(l.produs_id)?.reteta.push({ articol_id: l.articol_id, cantitate: l.cantitate });
  }
  const modificatori = new Map<number, DefinitieModificator>();
  if (modificatoriIds.length) {
    const m = await db.query<any>('SELECT * FROM modificatori WHERE id = ANY($1::int[])', [modificatoriIds]);
    for (const x of m) modificatori.set(x.id, { ...x, adauga: [] });
    const l = await db.query<{ modificator_id: number; articol_id: number; cantitate: number }>(
      'SELECT * FROM modificatori_linii WHERE modificator_id = ANY($1::int[])',
      [modificatoriIds],
    );
    for (const x of l) modificatori.get(x.modificator_id)?.adauga.push({ articol_id: x.articol_id, cantitate: x.cantitate });
  }
  return { produse, modificatori };
}

// ---- Catalogul descărcat de tabletă ----

export async function catalogPOS(db: Db, locatieId: number): Promise<CatalogPOS> {
  const loc = (await db.query<{ id: number; nume: string }>('SELECT id, nume FROM locatii WHERE id = $1', [locatieId]))[0];
  if (!loc) throw new EroareNegasit('Locația');
  const categorii = await db.query<{ id: number; nume: string }>('SELECT id, nume FROM categorii ORDER BY ordine, nume');
  const produse = await db.query<any>(
    'SELECT id, nume, categorie_id, pret, doze_cafea FROM produse WHERE activ ORDER BY ordine, nume',
  );
  const pm = await db.query<{ produs_id: number; modificator_id: number }>(
    `SELECT pm.* FROM produse_modificatori pm JOIN modificatori m ON m.id = pm.modificator_id WHERE m.activ`,
  );
  const modificatori = await db.query<any>('SELECT id, nume, pret FROM modificatori WHERE activ ORDER BY nume');
  const baristi = await db.query<any>(
    `SELECT id, nume, pin_hash, sare FROM utilizatori
      WHERE activ AND pin_hash IS NOT NULL AND (locatie_id IS NULL OR locatie_id = $1)
      ORDER BY nume`,
    [locatieId],
  );
  const continut = {
    locatie: loc,
    categorii,
    produse: produse.map((p) => ({ ...p, modificatori: pm.filter((x) => x.produs_id === p.id).map((x) => x.modificator_id) })),
    modificatori,
    baristi,
  };
  const versiune = createHash('sha1').update(JSON.stringify(continut)).digest('hex').slice(0, 12);
  return { versiune, ...continut, generat_la: new Date().toISOString() };
}
