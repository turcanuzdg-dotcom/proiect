import { rotunjeste, type Cont } from '@cafenea/shared';
import type { Db } from '../db';
import { EroareUtilizator } from '../erori';

/** Soldul de numerar al fiecărei locații și încasările pe card dintr-un interval. */
export async function rezumatBani(db: Db, de: string, pana: string) {
  return db.query(
    `SELECT l.id AS locatie_id, l.nume AS locatie,
            COALESCE((SELECT SUM(suma) FROM miscari_bani m WHERE m.locatie_id = l.id AND m.cont = 'numerar'), 0)::numeric AS sold_numerar,
            COALESCE(SUM(m.suma) FILTER (WHERE m.cont = 'numerar' AND m.tip IN ('incasare', 'restituire')), 0)::numeric AS incasari_numerar,
            COALESCE(SUM(m.suma) FILTER (WHERE m.cont = 'card' AND m.tip IN ('incasare', 'restituire')), 0)::numeric AS incasari_card,
            COALESCE(SUM(m.suma) FILTER (WHERE m.tip = 'plata_marunta'), 0)::numeric AS plati_marunte,
            COALESCE(SUM(m.suma) FILTER (WHERE m.tip = 'depunere'), 0)::numeric AS depuneri,
            COALESCE(SUM(m.suma) FILTER (WHERE m.tip = 'alimentare'), 0)::numeric AS alimentari,
            COALESCE(SUM(m.suma) FILTER (WHERE m.tip = 'diferenta_casa'), 0)::numeric AS diferente
       FROM locatii l
       LEFT JOIN miscari_bani m ON m.locatie_id = l.id AND m.creata_la >= $1 AND m.creata_la < $2
      WHERE l.tip = 'punct'
      GROUP BY l.id ORDER BY l.id`,
    [de, pana],
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
}

/** Operațiuni de casă introduse din panou: depuneri la bancă/ridicări, alimentări, plăți mărunte. */
export async function adaugaMiscareBani(db: Db, d: DateMiscareAdmin, utilizatorId: number) {
  if (!(d.suma > 0)) throw new EroareUtilizator('Suma trebuie să fie pozitivă');
  const semn = d.tip === 'alimentare' ? 1 : -1;
  const r = await db.query(
    `INSERT INTO miscari_bani (locatie_id, cont, suma, tip, descriere, utilizator_id)
     VALUES ($1, 'numerar', $2, $3, $4, $5) RETURNING *`,
    [d.locatie_id, semn * rotunjeste(d.suma), d.tip, d.descriere, utilizatorId],
  );
  return r[0];
}
