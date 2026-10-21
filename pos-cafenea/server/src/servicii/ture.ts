import { rotunjeste, type DatePlataMarunta, type DateTuraDeschisa, type DateTuraInchisa } from '@cafenea/shared';
import type { Db } from '../db';
import { EroareNegasit, EroareUtilizator } from '../erori';
import { citesteTolerante } from './setari';
import { asiguraTura, type ContextPOS } from './vanzari';

/** Numerarul care ar trebui să fie în sertar (registrul de bani al locației). */
export async function soldNumerar(db: Db, locatieId: number, pana?: string | Date): Promise<number> {
  const r = await db.query<{ sold: number }>(
    `SELECT COALESCE(SUM(suma), 0)::numeric AS sold FROM miscari_bani
      WHERE locatie_id = $1 AND cont = 'numerar' AND ($2::timestamptz IS NULL OR creata_la <= $2::timestamptz)`,
    [locatieId, pana ? new Date(pana).toISOString() : null],
  );
  return rotunjeste(r[0].sold);
}

async function diferentaCasa(
  db: Db,
  locatieId: number,
  turaId: string,
  suma: number,
  tip: 'diferenta_casa' | 'fond_initial',
  descriere: string,
  utilizatorId: number,
  la: string,
) {
  if (suma === 0) return;
  await db.query(
    `INSERT INTO miscari_bani (locatie_id, cont, suma, tip, descriere, tura_id, document_tip, document_id, utilizator_id, creata_la)
     VALUES ($1, 'numerar', $2, $3, $4, $5, 'tura', $6, $7, $8)`,
    [locatieId, suma, tip, descriere, turaId, turaId, utilizatorId, la],
  );
}

/**
 * Deschiderea turei: barista numără fondul din sertar. O diferență față de registru
 * (bani dispăruți între ture) se notează și registrul se aliniază la realitate.
 */
export async function deschideTura(db: Db, ctx: ContextPOS, la: string, d: DateTuraDeschisa): Promise<void> {
  const existenta = (await db.query<{ locatie_id: number; inchisa_la: string | null }>('SELECT locatie_id, inchisa_la FROM ture WHERE id = $1', [d.tura_id]))[0];
  if (existenta && existenta.locatie_id !== ctx.locatie_id) throw new EroareUtilizator('Tura aparține altei locații');

  const anterioare = await db.query('SELECT 1 FROM ture WHERE locatie_id = $1 AND id <> $2 LIMIT 1', [ctx.locatie_id, d.tura_id]);
  const scriptic = await soldNumerar(db, ctx.locatie_id, la);
  const fond = rotunjeste(d.fond_initial);
  const dif = rotunjeste(fond - scriptic);
  const tol = await citesteTolerante(db);

  if (existenta) {
    await db.query(
      `UPDATE ture SET utilizator_id = $2, deschisa_la = LEAST(deschisa_la, $3::timestamptz), fond_initial = $4, scriptic_fond = $5,
              creata_automat = false, are_discrepante = are_discrepante OR $6
        WHERE id = $1`,
      [d.tura_id, d.utilizator_id, la, fond, scriptic, anterioare.length > 0 && Math.abs(dif) > tol.numerar],
    );
  } else {
    await db.query(
      `INSERT INTO ture (id, locatie_id, dispozitiv_id, utilizator_id, deschisa_la, fond_initial, scriptic_fond, are_discrepante)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [d.tura_id, ctx.locatie_id, ctx.dispozitiv_id, d.utilizator_id, la, fond, scriptic, anterioare.length > 0 && Math.abs(dif) > tol.numerar],
    );
  }
  // Prima tură a locației stabilește fondul de pornire; nu e o discrepanță.
  if (anterioare.length) {
    await diferentaCasa(db, ctx.locatie_id, d.tura_id, dif, 'diferenta_casa', 'Diferență la deschiderea turei', d.utilizator_id, la);
  } else {
    await diferentaCasa(db, ctx.locatie_id, d.tura_id, dif, 'fond_initial', 'Fondul de pornire al casei', d.utilizator_id, la);
  }
}

export async function plataMarunta(db: Db, ctx: ContextPOS, la: string, d: DatePlataMarunta): Promise<void> {
  if (!(d.suma > 0)) throw new EroareUtilizator('Suma plății trebuie să fie pozitivă');
  await asiguraTura(db, ctx, d.tura_id, la, d.utilizator_id);
  await db.query(
    `INSERT INTO miscari_bani (locatie_id, cont, suma, tip, descriere, tura_id, utilizator_id, creata_la)
     VALUES ($1, 'numerar', $2, 'plata_marunta', $3, $4, $5, $6)`,
    [ctx.locatie_id, -rotunjeste(d.suma), d.descriere, d.tura_id, d.utilizator_id, la],
  );
}

export interface CalculTura {
  scriptic_numerar: number;
  scriptic_card: number;
  scriptic_doze: number;
  scriptic_anulari: number;
  scriptic_casari: number;
}

/** Ce „trebuia să fie” conform sistemului pentru o tură, până la momentul `la`. */
export async function calculeazaScriptic(db: Db, turaId: string, locatieId: number, la: string): Promise<CalculTura> {
  const card = await db.query<{ s: number }>(
    `SELECT COALESCE(SUM(suma), 0)::numeric AS s FROM miscari_bani WHERE tura_id = $1 AND cont = 'card'`,
    [turaId],
  );
  // Dozele se consumă și la casări; o comandă anulată cu stocul restituit n-a fost preparată.
  const doze = await db.query<{ s: number }>(
    `SELECT COALESCE(SUM(doze_cafea), 0)::numeric AS s FROM comenzi
      WHERE tura_id = $1 AND NOT (stare = 'anulata' AND stoc_restituit)`,
    [turaId],
  );
  const anulari = await db.query<{ s: number }>(
    `SELECT COALESCE(SUM(cl.cantitate), 0)::int AS s FROM comenzi c JOIN comenzi_linii cl ON cl.comanda_id = c.id
      WHERE c.anulare_tura_id = $1`,
    [turaId],
  );
  const casari = await db.query<{ s: number }>(
    `SELECT COALESCE(SUM(cl.cantitate), 0)::int AS s FROM comenzi c JOIN comenzi_linii cl ON cl.comanda_id = c.id
      WHERE c.tura_id = $1 AND c.metoda = 'casare' AND c.stare = 'finalizata'`,
    [turaId],
  );
  return {
    scriptic_numerar: await soldNumerar(db, locatieId, la),
    scriptic_card: rotunjeste(card[0].s),
    scriptic_doze: rotunjeste(doze[0].s),
    scriptic_anulari: anulari[0].s,
    scriptic_casari: casari[0].s,
  };
}

/**
 * Închiderea „oarbă” a turei: barista declară ce a numărat fără să vadă cifrele scriptice;
 * sistemul compară, aliniază registrul de numerar și ridică alerta pentru admin.
 */
export async function inchideTura(db: Db, ctx: ContextPOS, la: string, d: DateTuraInchisa): Promise<void> {
  await asiguraTura(db, ctx, d.tura_id, la, d.utilizator_id);
  const t = (await db.query<{ inchisa_la: string | null }>('SELECT inchisa_la FROM ture WHERE id = $1 FOR UPDATE', [d.tura_id]))[0];
  if (t.inchisa_la) throw new EroareUtilizator('Tura este deja închisă');

  const s = await calculeazaScriptic(db, d.tura_id, ctx.locatie_id, la);
  const tol = await citesteTolerante(db);
  const difNumerar = rotunjeste(d.numerar - s.scriptic_numerar);
  const discrepante =
    Math.abs(difNumerar) > tol.numerar ||
    Math.abs(d.card - s.scriptic_card) > tol.card ||
    Math.abs(d.doze - s.scriptic_doze) > tol.doze ||
    d.anulari !== s.scriptic_anulari ||
    d.casari !== s.scriptic_casari;

  await db.query(
    `UPDATE ture SET inchisa_la = $2, inchisa_de = $3, declarat_doze = $4, declarat_numerar = $5, declarat_card = $6,
            declarat_anulari = $7, declarat_casari = $8, observatii = $9, scriptic_doze = $10, scriptic_numerar = $11,
            scriptic_card = $12, scriptic_anulari = $13, scriptic_casari = $14,
            are_discrepante = are_discrepante OR $15
      WHERE id = $1`,
    [
      d.tura_id, la, d.utilizator_id, d.doze, rotunjeste(d.numerar), rotunjeste(d.card), d.anulari, d.casari,
      d.observatii ?? null, s.scriptic_doze, s.scriptic_numerar, s.scriptic_card, s.scriptic_anulari, s.scriptic_casari,
      discrepante,
    ],
  );
  await diferentaCasa(db, ctx.locatie_id, d.tura_id, difNumerar, 'diferenta_casa', 'Diferență la închiderea turei', d.utilizator_id, la);
}

const SELECT_TURA = `
  SELECT t.*, l.nume AS locatie, u.nume AS barista, ui.nume AS inchisa_de_nume, uv.nume AS verificata_de_nume,
         (t.declarat_numerar - t.scriptic_numerar) AS dif_numerar,
         (t.declarat_card - t.scriptic_card) AS dif_card,
         (t.declarat_doze - t.scriptic_doze) AS dif_doze,
         (t.declarat_anulari - t.scriptic_anulari) AS dif_anulari,
         (t.declarat_casari - t.scriptic_casari) AS dif_casari,
         (t.fond_initial - t.scriptic_fond) AS dif_fond,
         (SELECT COALESCE(SUM(c.total), 0) FROM comenzi c WHERE c.tura_id = t.id AND c.stare = 'finalizata') AS vanzari,
         (SELECT COUNT(*) FROM comenzi c WHERE c.tura_id = t.id) AS nr_comenzi
    FROM ture t
    JOIN locatii l ON l.id = t.locatie_id
    LEFT JOIN utilizatori u ON u.id = t.utilizator_id
    LEFT JOIN utilizatori ui ON ui.id = t.inchisa_de
    LEFT JOIN utilizatori uv ON uv.id = t.verificata_de`;

export async function listaTure(db: Db, f: { locatie_id?: number; doar_discrepante?: boolean; neverificate?: boolean; limita?: number }) {
  const cond: string[] = [];
  const p: unknown[] = [];
  if (f.locatie_id) {
    p.push(f.locatie_id);
    cond.push(`t.locatie_id = $${p.length}`);
  }
  if (f.doar_discrepante) cond.push('t.are_discrepante');
  if (f.neverificate) cond.push('t.verificata_la IS NULL');
  p.push(Math.min(f.limita ?? 100, 500));
  return db.query(`${SELECT_TURA} ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY t.deschisa_la DESC LIMIT $${p.length}`, p);
}

export async function detaliuTura(db: Db, id: string) {
  const t = (await db.query(`${SELECT_TURA} WHERE t.id = $1`, [id]))[0];
  if (!t) throw new EroareNegasit('Tura');
  const bani = await db.query(
    `SELECT cont, tip, COUNT(*)::int AS nr, SUM(suma)::numeric AS suma FROM miscari_bani WHERE tura_id = $1 GROUP BY cont, tip ORDER BY cont, tip`,
    [id],
  );
  return { ...t, bani };
}

export async function verificaTura(db: Db, id: string, utilizatorId: number, nota: string | null) {
  const r = await db.query(
    'UPDATE ture SET verificata_de = $2, verificata_la = now(), nota_verificare = $3 WHERE id = $1 RETURNING id',
    [id, utilizatorId, nota],
  );
  if (!r[0]) throw new EroareNegasit('Tura');
}
