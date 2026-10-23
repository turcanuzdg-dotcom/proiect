import { rotunjeste, type Cont } from '@cafenea/shared';
import type { Db } from '../db';
import { EroareUtilizator } from '../erori';
import { BANI, inchisPana, sqlSold } from './solduri';
import { blocheazaCasa, corecteazaNumarariUlterioare } from './ture';

/** Soldul de numerar al fiecărei locații și încasările pe card dintr-un interval. */
export async function rezumatBani(db: Db, de: string, pana: string) {
  return db.query(
    `SELECT l.id AS locatie_id, l.nume AS locatie,
            COALESCE(sn.sold, 0)::numeric AS sold_numerar,
            COALESCE(SUM(m.suma) FILTER (WHERE m.cont = 'numerar' AND m.tip IN ('incasare', 'restituire')), 0)::numeric AS incasari_numerar,
            COALESCE(SUM(m.suma) FILTER (WHERE m.cont = 'card' AND m.tip IN ('incasare', 'restituire')), 0)::numeric AS incasari_card,
            COALESCE(SUM(m.suma) FILTER (WHERE m.tip = 'plata_marunta'), 0)::numeric AS plati_marunte,
            COALESCE(SUM(m.suma) FILTER (WHERE m.tip = 'depunere'), 0)::numeric AS depuneri,
            COALESCE(SUM(m.suma) FILTER (WHERE m.tip = 'alimentare'), 0)::numeric AS alimentari,
            COALESCE(SUM(m.suma) FILTER (WHERE m.tip = 'diferenta_casa'), 0)::numeric AS diferente
       FROM locatii l
       LEFT JOIN ${sqlSold(BANI, { n: '$3::bigint', dupa: "= 'numerar'" })} sn ON sn.locatie_id = l.id
       LEFT JOIN miscari_bani m ON m.locatie_id = l.id AND m.creata_la >= $1 AND m.creata_la < $2
      WHERE l.tip = 'punct'
      GROUP BY l.id, sn.sold ORDER BY l.id`,
    [de, pana, await inchisPana(db, BANI)],
  );
}

export async function listaMiscariBani(db: Db, f: { locatie_id?: number; cont?: Cont; de?: string; pana?: string; limita?: number }) {
  const cond: string[] = [];
  const p: unknown[] = [];
  const adauga = (sql: string, v: unknown) => {
    p.push(v);
    cond.push(sql.replace('?', `$${p.length}`));
  };
  if (f.locatie_id) adauga('m.locatie_id = ?', f.locatie_id);
  if (f.cont) adauga('m.cont = ?', f.cont);
  if (f.de) adauga('m.creata_la >= ?', f.de);
  if (f.pana) adauga('m.creata_la < ?', f.pana);
  p.push(Math.min(f.limita ?? 300, 2000));
  return db.query(
    `SELECT m.*, l.nume AS locatie, u.nume AS utilizator
       FROM miscari_bani m JOIN locatii l ON l.id = m.locatie_id LEFT JOIN utilizatori u ON u.id = m.utilizator_id
      ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
      ORDER BY m.creata_la DESC, m.id DESC LIMIT $${p.length}`,
    p,
  );
}

export interface DateMiscareAdmin {
  locatie_id: number;
  tip: 'depunere' | 'alimentare' | 'plata_marunta';
  suma: number;
  descriere: string;
  /** Momentul real al operațiunii (ISO); lipsă = acum. */
  la?: string | null;
}

/**
 * Operațiuni de casă introduse din panou: depuneri la bancă/ridicări, alimentări, plăți mărunte.
 * Se înregistrează la momentul real: o depunere făcută aseară și introdusă azi intră în ziua de
 * ieri, iar numărarea de la închiderea turei de aseară e corectată, nu pe cea de azi.
 */
export async function adaugaMiscareBani(db: Db, d: DateMiscareAdmin, utilizatorId: number) {
  if (!(d.suma > 0)) throw new EroareUtilizator('Suma trebuie să fie pozitivă');
  const la = d.la ? new Date(d.la) : new Date();
  if (Number.isNaN(la.getTime())) throw new EroareUtilizator('Momentul operațiunii nu e valid');
  if (la.getTime() > Date.now() + 5 * 60_000) throw new EroareUtilizator('Momentul operațiunii nu poate fi în viitor');
  const suma = (d.tip === 'alimentare' ? 1 : -1) * rotunjeste(d.suma);
  return db.tx(async (t) => {
    // Partajat: o numărare de casă în curs pe locație se termină întâi (vezi blocheazaCasa).
    await blocheazaCasa(t, d.locatie_id);
    const r = await t.query(
      `INSERT INTO miscari_bani (locatie_id, cont, suma, tip, descriere, utilizator_id, creata_la)
       VALUES ($1, 'numerar', $2, $3, $4, $5, $6) RETURNING *`,
      [d.locatie_id, suma, d.tip, d.descriere, utilizatorId, la.toISOString()],
    );
    await corecteazaNumarariUlterioare(t, d.locatie_id, la.toISOString(), suma, utilizatorId);
    return r[0];
  });
}
