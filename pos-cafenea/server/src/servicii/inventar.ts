import { rotunjeste } from '@cafenea/shared';
import type { Db } from '../db';
import { EroareNegasit, EroareUtilizator } from '../erori';
import { inregistreazaMiscari, stocLocatie } from './stoc';

export async function creeazaInventariere(db: Db, d: { locatie_id: number; utilizator_id?: number | null; dispozitiv_id?: number | null }) {
  const deschisa = await db.query<{ id: number }>(
    `SELECT id FROM inventarieri WHERE locatie_id = $1 AND stare = 'deschisa' ORDER BY id DESC LIMIT 1`,
    [d.locatie_id],
  );
  if (deschisa[0]) return { id: deschisa[0].id };
  const r = await db.query<{ id: number }>(
    'INSERT INTO inventarieri (locatie_id, utilizator_id, dispozitiv_id) VALUES ($1, $2, $3) RETURNING id',
    [d.locatie_id, d.utilizator_id ?? null, d.dispozitiv_id ?? null],
  );
  return { id: r[0].id };
}

async function inventariere(db: Db, id: number) {
  const inv = (await db.query<any>('SELECT i.*, l.nume AS locatie FROM inventarieri i JOIN locatii l ON l.id = i.locatie_id WHERE i.id = $1', [id]))[0];
  if (!inv) throw new EroareNegasit('Inventarierea');
  return inv;
}

/** Salvează cantitățile numărate (se poate număra pe bucăți, în mai multe trimiteri). */
export async function salveazaNumaratori(db: Db, id: number, linii: { articol_id: number; faptic: number | null }[]) {
  const inv = await inventariere(db, id);
  if (inv.stare !== 'deschisa') throw new EroareUtilizator('Inventarierea este deja finalizată');
  await db.tx(async (t) => {
    const sterse = linii.filter((l) => l.faptic == null).map((l) => l.articol_id);
    if (sterse.length) await t.query('DELETE FROM inventarieri_linii WHERE inventariere_id = $1 AND articol_id = ANY($2::int[])', [id, sterse]);
    const puse = linii.filter((l) => l.faptic != null);
    if (puse.some((l) => l.faptic! < 0)) throw new EroareUtilizator('Cantitatea numărată nu poate fi negativă');
    for (const l of puse) {
      await t.query(
        `INSERT INTO inventarieri_linii (inventariere_id, articol_id, faptic) VALUES ($1, $2, $3)
         ON CONFLICT (inventariere_id, articol_id) DO UPDATE SET faptic = EXCLUDED.faptic, numarat_la = now()`,
        [id, l.articol_id, l.faptic],
      );
    }
  });
}

/**
 * Scripticul fiecărui articol numărat, la momentul numărării lui: vânzările făcute după ce
 * barista a numărat un raft nu mai „strică” diferența (registrul are momentul fiecărei mișcări,
 * deci și vânzările offline sincronizate mai târziu cad unde trebuie).
 */
async function liniiNumarate(db: Db, id: number, locatieId: number) {
  return db.query<{ articol_id: number; faptic: number; numarat_la: string; scriptic: number }>(
    `SELECT il.articol_id, il.faptic, il.numarat_la,
            COALESCE(il.scriptic, (SELECT COALESCE(SUM(m.cantitate), 0) FROM miscari_stoc m
                                    WHERE m.locatie_id = $2 AND m.articol_id = il.articol_id
                                      AND m.creata_la <= il.numarat_la))::numeric AS scriptic
       FROM inventarieri_linii il WHERE il.inventariere_id = $1`,
    [id, locatieId],
  );
}

/**
 * Raportul Scriptic vs. Faptic, generat pe loc. Articolele încă nenumărate arată stocul de acum
 * (se schimbă la fiecare vânzare); cele numărate, stocul din momentul numărării.
 */
export async function raportInventariere(db: Db, id: number) {
  const inv = await inventariere(db, id);
  const numarate = new Map((await liniiNumarate(db, id, inv.locatie_id)).map((l) => [l.articol_id, l]));
  const stoc = await stocLocatie(db, inv.locatie_id);
  let plus = 0;
  let minus = 0;
  const randuri = stoc
    .filter((a) => inv.stare === 'deschisa' || numarate.has(a.articol_id))
    .map((a) => {
      const n = numarate.get(a.articol_id);
      const scriptic = n ? n.scriptic : a.stoc;
      const faptic = n ? n.faptic : null;
      const diferenta = faptic == null ? null : rotunjeste(faptic - scriptic, 3);
      const valoare = diferenta == null ? null : rotunjeste(diferenta * a.cost_mediu);
      if (valoare != null && valoare > 0) plus += valoare;
      if (valoare != null && valoare < 0) minus += valoare;
      return {
        articol_id: a.articol_id, nume: a.nume, um: a.um, tip: a.tip,
        scriptic: rotunjeste(scriptic, 3), faptic, diferenta, valoare, numarat_la: n?.numarat_la ?? null,
      };
    });
  return {
    ...inv,
    linii: randuri,
    numarate: numarate.size,
    total_plus: rotunjeste(plus),
    total_minus: rotunjeste(minus),
    total_net: rotunjeste(plus + minus),
  };
}

/** Îngheață scripticul, înregistrează diferențele ca mișcări de stoc și închide inventarierea. */
export async function finalizeazaInventariere(db: Db, id: number) {
  return db.tx(async (t) => {
    const inv = (await t.query<any>('SELECT * FROM inventarieri WHERE id = $1 FOR UPDATE', [id]))[0];
    if (!inv) throw new EroareNegasit('Inventarierea');
    if (inv.stare !== 'deschisa') throw new EroareUtilizator('Inventarierea este deja finalizată');
    const linii = await liniiNumarate(t, id, inv.locatie_id);
    if (!linii.length) throw new EroareUtilizator('Nu s-a numărat niciun articol');
    const costuri = new Map((await t.query<{ id: number; cost_mediu: number }>('SELECT id, cost_mediu FROM articole')).map((a) => [a.id, a.cost_mediu]));
    for (const l of linii) {
      await t.query('UPDATE inventarieri_linii SET scriptic = $3 WHERE inventariere_id = $1 AND articol_id = $2', [id, l.articol_id, l.scriptic]);
    }
    // Ajustarea are data numărării, deci stocul de acum = faptic + ce s-a mișcat după numărare.
    await inregistreazaMiscari(
      t,
      linii.map((l) => ({
        locatie_id: inv.locatie_id,
        articol_id: l.articol_id,
        cantitate: rotunjeste(l.faptic - l.scriptic, 3),
        tip: 'inventar' as const,
        document_tip: 'inventariere',
        document_id: id,
        cost_unitar: costuri.get(l.articol_id) ?? 0,
        creata_la: l.numarat_la,
      })),
    );
    await t.query(`UPDATE inventarieri SET stare = 'finalizata', finalizata_la = now() WHERE id = $1`, [id]);
  });
}

export async function listaInventarieri(db: Db, locatieId?: number) {
  return db.query(
    `SELECT i.*, l.nume AS locatie, u.nume AS utilizator,
            (SELECT COUNT(*) FROM inventarieri_linii il WHERE il.inventariere_id = i.id) AS nr_linii,
            (SELECT COALESCE(SUM(m.cantitate * m.cost_unitar), 0) FROM miscari_stoc m
              WHERE m.document_tip = 'inventariere' AND m.document_id = i.id::text) AS valoare_diferente
       FROM inventarieri i JOIN locatii l ON l.id = i.locatie_id LEFT JOIN utilizatori u ON u.id = i.utilizator_id
      WHERE ($1::int IS NULL OR i.locatie_id = $1)
      ORDER BY i.inceputa_la DESC LIMIT 200`,
    [locatieId ?? null],
  );
}
