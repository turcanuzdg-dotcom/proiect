import type { Db } from '../db';
import { NEVERIFICATA } from './ture';

/** Prima pagină a adminului: vânzările de azi și tot ce cere atenție. */
export async function panou(db: Db, deAzi: string) {
  const vanzari = await db.query(
    `SELECT l.id AS locatie_id, l.nume AS locatie,
            COUNT(c.id) FILTER (WHERE c.metoda <> 'casare')::int AS comenzi,
            COALESCE(SUM(c.total) FILTER (WHERE c.metoda = 'numerar'), 0)::numeric AS numerar,
            COALESCE(SUM(c.total) FILTER (WHERE c.metoda = 'card'), 0)::numeric AS card,
            COALESCE(SUM(c.total), 0)::numeric AS total,
            COUNT(c.id) FILTER (WHERE c.metoda = 'casare')::int AS casari,
            (SELECT COUNT(*) FROM ture t WHERE t.locatie_id = l.id AND t.inchisa_la IS NULL)::int AS ture_deschise
       FROM locatii l
       LEFT JOIN comenzi c ON c.locatie_id = l.id AND c.creata_la >= $1 AND c.stare = 'finalizata'
      WHERE l.tip = 'punct' AND l.activ
      GROUP BY l.id ORDER BY l.id`,
    [deAzi],
  );
  const discrepante = await db.query(
    `SELECT t.id, t.deschisa_la, t.inchisa_la, l.nume AS locatie, u.nume AS barista,
            (t.declarat_numerar - t.scriptic_numerar) AS dif_numerar,
            (t.declarat_card - t.scriptic_card) AS dif_card,
            (t.declarat_doze - t.scriptic_doze) AS dif_doze,
            (t.declarat_anulari - t.scriptic_anulari) AS dif_anulari,
            (t.declarat_casari - t.scriptic_casari) AS dif_casari,
            CASE WHEN EXISTS (SELECT 1 FROM miscari_bani mb WHERE mb.tura_id = t.id AND mb.tip = 'fond_initial') THEN NULL
                 ELSE (t.fond_initial - t.scriptic_fond) END AS dif_fond,
            (t.verificata_la IS NOT NULL) AS modificata_dupa_verif
       FROM ture t JOIN locatii l ON l.id = t.locatie_id LEFT JOIN utilizatori u ON u.id = t.utilizator_id
      WHERE t.are_discrepante AND ${NEVERIFICATA}
      ORDER BY t.deschisa_la DESC LIMIT 50`,
  );
  const subPrag = await db.query(
    `SELECT l.nume AS locatie, a.nume, a.um, a.prag_minim, COALESCE(s.stoc, 0)::numeric AS stoc
       FROM articole a
       CROSS JOIN locatii l
       LEFT JOIN (SELECT locatie_id, articol_id, SUM(cantitate) AS stoc FROM miscari_stoc GROUP BY 1, 2) s
         ON s.articol_id = a.id AND s.locatie_id = l.id
      WHERE a.activ AND a.prag_minim > 0 AND l.activ AND l.tip = 'punct' AND COALESCE(s.stoc, 0) < a.prag_minim
      ORDER BY l.nume, a.nume LIMIT 100`,
  );
  const eroriSync = (await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM evenimente_sync WHERE stare = 'eroare'`))[0].n;
  const dispozitive = await db.query(
    `SELECT d.nume, l.nume AS locatie, d.ultima_sincronizare FROM dispozitive d JOIN locatii l ON l.id = d.locatie_id
      WHERE d.activ AND d.token IS NOT NULL ORDER BY d.ultima_sincronizare NULLS FIRST`,
  );
  // Ultimele 7 zile: prețuri diferite de catalog (vânzări offline după o schimbare de preț sau date
  // alterate) și operațiuni cu ora tabletei dată înapoi.
  const [{ n: preturiAbatute }] = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM comenzi WHERE pret_abatere AND creata_la >= now() - interval '7 days'`,
  );
  const [{ n: oreSuspecte }] = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM evenimente_sync WHERE ora_suspecta AND primit_la >= now() - interval '7 days'`,
  );
  return { vanzari, discrepante, sub_prag: subPrag, erori_sync: eroriSync, dispozitive, preturi_abatute: preturiAbatute, ore_suspecte: oreSuspecte };
}
