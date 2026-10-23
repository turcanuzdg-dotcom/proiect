import { rotunjeste } from '@cafenea/shared';
import type { Db } from '../db';
import { EroareNegasit, EroareUtilizator } from '../erori';
import { inchisPana, sqlSold, STOC } from './solduri';
import { CHEIE_STOC, inregistreazaMiscari, stocLocatie } from './stoc';

/** Pe o locație există o singură inventariere deschisă; tableta și panoul lucrează pe aceeași foaie. */
export async function creeazaInventariere(db: Db, d: { locatie_id: number; utilizator_id?: number | null; dispozitiv_id?: number | null }) {
  return db.tx(async (t) => {
    const noua = await t.query<{ id: number }>(
      `INSERT INTO inventarieri (locatie_id, utilizator_id, dispozitiv_id) VALUES ($1, $2, $3)
       ON CONFLICT (locatie_id) WHERE stare = 'deschisa' DO NOTHING RETURNING id`,
      [d.locatie_id, d.utilizator_id ?? null, d.dispozitiv_id ?? null],
    );
    if (noua[0]) return { id: noua[0].id };
    const deschisa = await t.query<{ id: number }>(`SELECT id FROM inventarieri WHERE locatie_id = $1 AND stare = 'deschisa'`, [d.locatie_id]);
    if (!deschisa[0]) throw new EroareNegasit('Locația');
    return { id: deschisa[0].id };
  });
}

async function inventariere(db: Db, id: number) {
  const inv = (await db.query<any>('SELECT i.*, l.nume AS locatie FROM inventarieri i JOIN locatii l ON l.id = i.locatie_id WHERE i.id = $1', [id]))[0];
  if (!inv) throw new EroareNegasit('Inventarierea');
  return inv;
}

/**
 * Salvează cantitățile numărate (se poate număra pe bucăți, în mai multe trimiteri).
 * Momentul numărării se schimbă doar când se schimbă cantitatea: retrimiterea aceleiași
 * valori nu mută scripticul.
 */
export async function salveazaNumaratori(db: Db, id: number, linii: { articol_id: number; faptic: number | null }[]) {
  if (linii.some((l) => l.faptic != null && l.faptic < 0)) throw new EroareUtilizator('Cantitatea numărată nu poate fi negativă');
  await db.tx(async (t) => {
    // Blocăm rândul inventarierii: o finalizare simultană așteaptă sau e văzută aici.
    const inv = (await t.query<{ stare: string }>('SELECT stare FROM inventarieri WHERE id = $1 FOR UPDATE', [id]))[0];
    if (!inv) throw new EroareNegasit('Inventarierea');
    if (inv.stare !== 'deschisa') throw new EroareUtilizator('Inventarierea este deja finalizată');
    const sterse = linii.filter((l) => l.faptic == null).map((l) => l.articol_id);
    if (sterse.length) await t.query('DELETE FROM inventarieri_linii WHERE inventariere_id = $1 AND articol_id = ANY($2::int[])', [id, sterse]);
    for (const l of linii.filter((l) => l.faptic != null)) {
      await t.query(
        `INSERT INTO inventarieri_linii (inventariere_id, articol_id, faptic) VALUES ($1, $2, $3)
         ON CONFLICT (inventariere_id, articol_id) DO UPDATE
           SET faptic = EXCLUDED.faptic,
               numarat_la = CASE WHEN inventarieri_linii.faptic = EXCLUDED.faptic THEN inventarieri_linii.numarat_la ELSE now() END`,
        [id, l.articol_id, l.faptic],
      );
    }
  });
}

/**
 * Scripticul fiecărui articol numărat, la momentul numărării lui: vânzările făcute după ce
 * barista a numărat un raft nu mai „strică” diferența (registrul are momentul fiecărei mișcări,
 * deci și vânzările offline sincronizate mai târziu cad unde trebuie).
 * Scripticul la numărare = stocul de acum (sold închis + coadă) minus mișcările datate după numărare,
 * calculate în aceeași instrucțiune (aceeași imagine a bazei). Se citesc doar mișcările de după
 * numărare, prin indexul (locație, articol, dată), nu tot istoricul articolului.
 */
async function liniiNumarate(db: Db, id: number, locatieId: number) {
  return db.query<{ articol_id: number; faptic: number; numarat_la: string; scriptic: number }>(
    `SELECT il.articol_id, il.faptic, il.numarat_la,
            COALESCE(il.scriptic,
                     COALESCE(s.sold, 0)
                     - COALESCE((SELECT SUM(m.cantitate) FROM miscari_stoc m
                                  WHERE m.locatie_id = $2 AND m.articol_id = il.articol_id
                                    AND m.creata_la > il.numarat_la), 0))::numeric AS scriptic
       FROM inventarieri_linii il
       LEFT JOIN ${sqlSold(STOC, { n: '$3::bigint', locatie: '$2::int' })} s ON s.articol_id = il.articol_id
      WHERE il.inventariere_id = $1`,
    [id, locatieId, await inchisPana(db, STOC)],
  );
}

export interface LinieRaportInventar {
  articol_id: number;
  nume: string;
  um: string;
  tip: string;
  activ: boolean;
  scriptic: number;
  faptic: number | null;
  diferenta: number | null;
  valoare: number | null;
  numarat_la: string | null;
}

function totaluri(linii: LinieRaportInventar[]) {
  let plus = 0;
  let minus = 0;
  for (const l of linii) {
    if (l.valoare != null && l.valoare > 0) plus += l.valoare;
    if (l.valoare != null && l.valoare < 0) minus += l.valoare;
  }
  return { total_plus: rotunjeste(plus), total_minus: rotunjeste(minus), total_net: rotunjeste(plus + minus) };
}

/**
 * Raportul Scriptic vs. Faptic. Deschisă: articolele nenumărate arată stocul de acum, cele numărate
 * stocul din momentul numărării. Finalizată: raportul e cel înghețat, citit din ajustările de stoc
 * (inclusiv compensările pentru mișcări sincronizate după numărare), deci coincide cu registrul.
 */
export async function raportInventariere(db: Db, id: number) {
  const inv = await inventariere(db, id);
  let linii: LinieRaportInventar[];
  if (inv.stare === 'finalizata') {
    const r = await db.query<any>(
      `SELECT il.articol_id, a.nume, a.um, a.tip, a.activ, il.faptic, il.numarat_la,
              COALESCE(m.dif, 0)::numeric AS diferenta, COALESCE(m.val, 0)::numeric AS valoare
         FROM inventarieri_linii il
         JOIN articole a ON a.id = il.articol_id
         LEFT JOIN (SELECT articol_id, SUM(cantitate) AS dif, SUM(cantitate * cost_unitar) AS val
                      FROM miscari_stoc WHERE document_tip = 'inventariere' AND document_id = $2 GROUP BY articol_id) m
           ON m.articol_id = il.articol_id
        WHERE il.inventariere_id = $1
        ORDER BY a.tip, a.nume`,
      [id, String(id)],
    );
    linii = r.map((x) => ({
      articol_id: x.articol_id, nume: x.nume, um: x.um, tip: x.tip, activ: x.activ,
      scriptic: rotunjeste(x.faptic - x.diferenta, 3), faptic: x.faptic,
      diferenta: rotunjeste(x.diferenta, 3), valoare: rotunjeste(x.valoare), numarat_la: x.numarat_la,
    }));
  } else {
    const numarate = new Map((await liniiNumarate(db, id, inv.locatie_id)).map((l) => [l.articol_id, l]));
    linii = (await stocLocatie(db, inv.locatie_id)).map((a) => {
      const n = numarate.get(a.articol_id);
      const scriptic = n ? n.scriptic : a.stoc;
      const faptic = n ? n.faptic : null;
      const diferenta = faptic == null ? null : rotunjeste(faptic - scriptic, 3);
      return {
        articol_id: a.articol_id, nume: a.nume, um: a.um, tip: a.tip, activ: a.activ,
        scriptic: rotunjeste(scriptic, 3), faptic, diferenta,
        valoare: diferenta == null ? null : rotunjeste(diferenta * a.cost_mediu), numarat_la: n?.numarat_la ?? null,
      };
    });
  }
  return { ...inv, linii, numarate: linii.filter((l) => l.faptic != null).length, ...totaluri(linii) };
}

/** Îngheață scripticul, înregistrează diferențele ca mișcări de stoc și închide inventarierea. */
export async function finalizeazaInventariere(db: Db, id: number) {
  return db.tx(async (t) => {
    const inv = (await t.query<any>('SELECT * FROM inventarieri WHERE id = $1 FOR UPDATE', [id]))[0];
    if (!inv) throw new EroareNegasit('Inventarierea');
    if (inv.stare !== 'deschisa') throw new EroareUtilizator('Inventarierea este deja finalizată');
    // Așteaptă mișcările de stoc ale locației aflate în lucru și le oprește pe cele noi până la final:
    // altfel o vânzare târzie, datată înaintea numărării, n-ar fi nici în scripticul înghețat aici, nici
    // compensată (compensariInventar nu vede o inventariere încă nevalidată).
    await t.query('SELECT pg_advisory_xact_lock($1, $2)', [CHEIE_STOC, inv.locatie_id]);
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
