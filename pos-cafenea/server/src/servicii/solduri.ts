import type { Db } from '../db';

/**
 * Solduri închise ale registrelor de stoc și de bani.
 *
 * Stocul și banii rămân sume de mișcări. Ca o citire să nu parcurgă tot istoricul, se păstrează din
 * oră în oră suma mișcărilor cu id <= pana_la_id („soldul închis”), calculată o singură dată și
 * niciodată modificată. Soldul de acum = ultimul sold închis + mișcările cu id > pana_la_id (coada
 * ultimei ore). Id-ul (bigserial) crește la inserare, deci o vânzare offline sincronizată târziu, cu
 * data ei veche, are un id nou și intră în coadă, iar soldul la un moment trecut scade din total
 * mișcările datate după acel moment, oricând au fost inserate.
 */

interface Registru {
  /** Cheia blocării consultative care serializează închiderile aceluiași registru. */
  cheie: number;
  miscari: 'miscari_stoc' | 'miscari_bani';
  solduri: 'solduri_stoc' | 'solduri_bani';
  /** Coloana care, alături de locatie_id, identifică soldul (articolul sau contul). */
  dupa: 'articol_id' | 'cont';
  valoare: 'cantitate' | 'suma';
}

export const STOC: Registru = { cheie: 1, miscari: 'miscari_stoc', solduri: 'solduri_stoc', dupa: 'articol_id', valoare: 'cantitate' };
export const BANI: Registru = { cheie: 2, miscari: 'miscari_bani', solduri: 'solduri_bani', dupa: 'cont', valoare: 'suma' };

/** Prima cheie a blocărilor consultative ale închiderilor (a doua e registrul). */
const CHEIE_SOLDURI = 7310;

/**
 * Cât poate aștepta închiderea blocarea SHARE a registrului. O cerere de blocare aflată în așteptare
 * oprește și inserările noi (vânzările) din spatele ei, deci așteptarea trebuie să fie scurtă: mai
 * bine se renunță și se reîncearcă decât să stea vânzările.
 */
const ASTEPTARE_BLOCARE = '100ms';
const INCERCARI = 5;

/** Un sold închis rămâne cel puțin atât după ce a apărut unul mai nou (o citire în curs îl poate folosi). */
const PASTRARE_IMPLICITA_MIN = 60;

export interface OptiuniInchidere {
  /** Minutele cât se mai păstrează un sold închis după ce a fost înlocuit (implicit 60). */
  pastreazaMin?: number;
  /** Pauza dintre reîncercări când registrul e ocupat (ms; implicit 200 × încercarea). */
  pauzaMs?: number;
}

/**
 * Închide ambele registre: întâi stocul, apoi banii, fiecare în tranzacțiile lui. O vânzare scrie în
 * ambele registre, în ordini diferite (anularea: întâi banii), deci două blocări ținute deodată ar
 * putea intra în impas cu ea. Întoarce id-ul până la care s-a închis fiecare (null = nimic nou).
 */
export async function inchideSolduri(db: Db, opt: OptiuniInchidere = {}): Promise<{ stoc: number | null; bani: number | null }> {
  return { stoc: await inchideRegistru(db, STOC, opt), bani: await inchideRegistru(db, BANI, opt) };
}

const pauza = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pragul închiderii: cel mai mare id din registru, citit sub blocarea SHARE. SHARE așteaptă
 * tranzacțiile care inserează chiar acum în registru și nu lasă altele noi cât citim MAX(id) (o
 * căutare în cheia primară, sub o milisecundă). După eliberare, orice mișcare cu id <= n e confirmată
 * și nu se mai schimbă (registrul nu se modifică), deci suma se poate face fără nicio blocare.
 */
async function prag(db: Db, r: Registru, opt: OptiuniInchidere): Promise<number | null> {
  for (let incercare = 1; ; incercare++) {
    try {
      return await db.tx(async (t) => {
        await t.exec(`SET LOCAL lock_timeout = '${ASTEPTARE_BLOCARE}'`);
        await t.exec(`LOCK TABLE ${r.miscari} IN SHARE MODE`);
        return (await t.query<{ n: number | null }>(`SELECT MAX(id) AS n FROM ${r.miscari}`))[0].n;
      });
    } catch (e) {
      // 55P03 = lock_not_available: o tranzacție lungă (o recepție mare, o finalizare de inventar)
      // scrie în registru. Vânzările n-au așteptat după noi mai mult de ASTEPTARE_BLOCARE.
      if ((e as { code?: string }).code !== '55P03' || incercare >= INCERCARI) throw e;
      await pauza((opt.pauzaMs ?? 200) * incercare);
    }
  }
}

async function inchideRegistru(db: Db, r: Registru, opt: OptiuniInchidere): Promise<number | null> {
  const n = await prag(db, r, opt);
  if (n == null) return null;
  return db.tx(async (t) => {
    // Prima închidere a unei baze vechi adună tot istoricul: poate trece de limita obișnuită.
    await t.exec(`SET LOCAL statement_timeout = '10min'`);
    // Două închideri simultane (cea orară și una cerută) nu calculează aceeași coadă de două ori.
    await t.query('SELECT pg_advisory_xact_lock($1, $2)', [CHEIE_SOLDURI, r.cheie]);
    const nou = await t.query<{ n: number }>(
      `WITH prec AS (SELECT COALESCE(MAX(pana_la_id), 0) AS n FROM ${r.solduri})
       INSERT INTO ${r.solduri} (pana_la_id, locatie_id, ${r.dupa}, ${r.valoare})
       SELECT $1, locatie_id, ${r.dupa}, SUM(v) FROM (
         SELECT locatie_id, ${r.dupa}, ${r.valoare} AS v FROM ${r.solduri} WHERE pana_la_id = (SELECT n FROM prec)
         UNION ALL
         SELECT locatie_id, ${r.dupa}, ${r.valoare} FROM ${r.miscari} WHERE id > (SELECT n FROM prec) AND id <= $1
       ) x
        WHERE $1::bigint > (SELECT n FROM prec)
        GROUP BY locatie_id, ${r.dupa}
       RETURNING pana_la_id AS n`,
      [n],
    );
    // Soldurile închise sunt doar o scurtătură (se pot reface oricând din registru), deci cele
    // înlocuite se șterg; registrele propriu-zise nu se ating. Se păstrează ultimul sold mai vechi de
    // `pastreazaMin` și toate cele mai noi: o citire care tocmai a aflat pragul îl găsește întreg.
    await t.query(
      `DELETE FROM ${r.solduri}
        WHERE pana_la_id < (SELECT MAX(pana_la_id) FROM ${r.solduri} WHERE inchis_la < now() - make_interval(mins => $1))`,
      [opt.pastreazaMin ?? PASTRARE_IMPLICITA_MIN],
    );
    return nou[0]?.n ?? null;
  });
}

/**
 * Id-ul până la care există sold închis (0 = niciunul: citirile adună tot registrul). Se citește
 * separat și se trimite ca parametru: ca subinterogare, planificatorul n-ar ști că „id > n” înseamnă
 * doar coada ultimei ore. Soldul cu acest id nu se schimbă, deci o închidere nouă între timp nu
 * strică rezultatul.
 */
export async function inchisPana(db: Db, r: Registru): Promise<number> {
  return (await db.query<{ n: number }>(`SELECT COALESCE(MAX(pana_la_id), 0) AS n FROM ${r.solduri}`))[0].n;
}

export interface FiltruSold {
  /** Expresia SQL a pragului (de regulă un parametru, din inchisPana). */
  n: string;
  /** Momentul soldului (expresie SQL timestamptz); lipsă = acum. */
  la?: string;
  /** Doar o locație (expresie SQL). */
  locatie?: string;
  /** Condiția pe articol/cont, fără numele coloanei: de ex. `= ANY($1::int[])` sau `= 'numerar'`. */
  dupa?: string;
}

/**
 * Soldurile pe (locatie_id, articol_id | cont), coloana `sold`, ca subinterogare SQL.
 * Acum: sold închis + coada. La momentul `la`: același total minus mișcările datate după `la`
 * (indiferent când au fost inserate), adică exact suma mișcărilor cu creata_la <= la. Totul într-o
 * singură instrucțiune, deci pe aceeași imagine a bazei. Termenul cu `la` citește doar mișcările
 * de după acel moment, prin indexul (locatie_id, …, creata_la).
 */
export function sqlSold(r: Registru, f: FiltruSold): string {
  const conditii = (alias: string) =>
    [f.locatie ? `${alias}.locatie_id = ${f.locatie}` : '', f.dupa ? `${alias}.${r.dupa} ${f.dupa}` : ''].filter(Boolean).map((c) => ` AND ${c}`).join('');
  return `(SELECT locatie_id, ${r.dupa}, SUM(v) AS sold FROM (
      SELECT s.locatie_id, s.${r.dupa}, s.${r.valoare} AS v FROM ${r.solduri} s WHERE s.pana_la_id = ${f.n}${conditii('s')}
      UNION ALL
      SELECT m.locatie_id, m.${r.dupa}, m.${r.valoare} FROM ${r.miscari} m WHERE m.id > ${f.n}${conditii('m')}${
        f.la
          ? `
      UNION ALL
      SELECT m.locatie_id, m.${r.dupa}, -m.${r.valoare} FROM ${r.miscari} m WHERE m.creata_la > ${f.la}${conditii('m')}`
          : ''
      }
    ) x GROUP BY locatie_id, ${r.dupa})`;
}
