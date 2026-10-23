import type { Db } from '../db';
import { ESECURI_PANA_LA_ALERTA, inchisPana, sqlSold, stareInchideri, STOC } from './solduri';
import { retururiNeanulate } from './terminal';
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
    `SELECT l.nume AS locatie, a.nume, a.um, a.prag_minim, COALESCE(s.sold, 0)::numeric AS stoc
       FROM articole a
       CROSS JOIN locatii l
       LEFT JOIN ${sqlSold(STOC, { n: '$1::bigint' })} s
         ON s.articol_id = a.id AND s.locatie_id = l.id
      WHERE a.activ AND a.prag_minim > 0 AND l.activ AND l.tip = 'punct' AND COALESCE(s.sold, 0) < a.prag_minim
      ORDER BY l.nume, a.nume LIMIT 100`,
    [await inchisPana(db, STOC)],
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
  // Pe tablete: alerta spune ce tabletă are ceasul schimbat; lista completă e în Setări → Ora tabletelor.
  const oreSuspecteTablete = await db.query<{ dispozitiv: string; locatie: string; n: number }>(
    `SELECT COALESCE(d.nume, '—') AS dispozitiv, COALESCE(l.nume, '—') AS locatie, COUNT(*)::int AS n
       FROM evenimente_sync e
       LEFT JOIN dispozitive d ON d.id = e.dispozitiv_id LEFT JOIN locatii l ON l.id = e.locatie_id
      WHERE e.ora_suspecta AND e.primit_la >= now() - interval '7 days'
      GROUP BY 1, 2 ORDER BY 3 DESC, 1`,
  );
  const oreSuspecte = oreSuspecteTablete.reduce((s, x) => s + x.n, 0);
  // Vânzări pe card fără plată aprobată de terminal. Se marchează (false) doar pe tabletele care aveau
  // terminal prin server la sincronizare, deci numărul e același cu lista din Comenzi și cu alerta turei.
  const [cardNeconfirmat] = await db.query<{ n: number; suma: number }>(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(c.total), 0)::numeric AS suma
       FROM comenzi c
      WHERE c.card_confirmat = false AND c.stare = 'finalizata' AND c.creata_la >= now() - interval '7 days'`,
  );
  // Retururi pe card aprobate fără anularea comenzii (după ASTEPTARE_ANULARE_MIN): banii au plecat, dar
  // vânzarea se numără încă la încasări. Aceleași ca pe tură și în Comenzi („Doar retur fără anulare”).
  const retururi = await retururiNeanulate(db);
  // Închiderea soldurilor cade de cel puțin o jumătate de oră: citirile rămân exacte, dar tot mai lente.
  const inchideri = stareInchideri();
  const solduriBlocate =
    inchideri && inchideri.esecuriLaRand >= ESECURI_PANA_LA_ALERTA
      ? { esecuri: inchideri.esecuriLaRand, ultima_reusita: inchideri.ultimaReusita?.toISOString() ?? null }
      : null;
  return {
    vanzari,
    discrepante,
    sub_prag: subPrag,
    erori_sync: eroriSync,
    dispozitive,
    preturi_abatute: preturiAbatute,
    ore_suspecte: oreSuspecte,
    ore_suspecte_tablete: oreSuspecteTablete,
    card_neconfirmat: cardNeconfirmat.n,
    card_neconfirmat_suma: Number(cardNeconfirmat.suma),
    retururi_neanulate: retururi,
    solduri_blocate: solduriBlocate,
  };
}
