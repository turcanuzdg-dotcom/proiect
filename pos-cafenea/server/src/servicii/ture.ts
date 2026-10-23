import { rotunjeste, type DatePlataMarunta, type DateTuraDeschisa, type DateTuraInchisa } from '@cafenea/shared';
import type { Db } from '../db';
import { EroareNegasit, EroareUtilizator } from '../erori';
import { citesteTolerante } from './setari';
import { BANI, inchisPana, sqlSold } from './solduri';
import { retururiNeanulate } from './terminal';

/**
 * Blocările pe locație (pg_advisory_xact_lock, eliberate la sfârșitul tranzacției).
 *
 * Tranzacțiile rulează la READ COMMITTED: o numărare de casă (deschiderea sau închiderea turei) nu
 * vede o mișcare de numerar scrisă în paralel și încă nevalidată, iar mișcarea nu vede numărarea, deci
 * nici una nu o corectează pe cealaltă (lipsă falsă la barista, registru dezaliniat definitiv).
 * La fel, finalizarea unei inventarieri și o vânzare târzie datată înaintea numărării.
 *
 * - Casa: numărările iau cheia exclusiv; orice tranzacție care atinge numerarul, cifrele unei ture
 *   sau corecteazaNumarariUlterioare o ia partajat (vânzările nu se așteaptă între ele).
 * - Stocul: finalizarea inventarierii ia cheia exclusiv; inregistreazaMiscari o ia partajat, o dată
 *   pentru fiecare locație atinsă, în ordinea crescătoare a id-ului (un transfer atinge două).
 *
 * Ordinea, ca să nu existe blocaj circular: casa se ia prima în tranzacție, înaintea oricărui rând din
 * `ture` (deschiderea, închiderea, vânzarea, anularea, plata mărunță, operațiunile de casă din panou);
 * stocul se ia după ea. Singura excepție e rândul tabletei din `dispozitive`, pe care sincronizarea îl
 * ia înaintea casei (verificaOra în sync.ts), dar doar FOR NO KEY UPDATE: el nu se ciocnește cu KEY SHARE
 * din INSERT-urile cu cheie străină spre tabletă (ture, comenzi, evenimente_sync) ale unei reaplicări
 * care ține casa, iar nicio altă tranzacție care ține casa nu ia acest rând în mod exclusiv. Finalizarea inventarierii, singura care ține stocul exclusiv, nu atinge nici casa,
 * nici turele; recepția ia stocul înaintea rândurilor din `articole`. O tranzacție care ține deja o cheie
 * o poate cere din nou, în orice mod, fără să se aștepte pe sine.
 */
export const CHEIE_CASA = 7302; // cheia stocului, CHEIE_STOC, e în stoc.ts

export async function blocheazaCasa(db: Db, locatieId: number, exclusiv = false): Promise<void> {
  await db.query(exclusiv ? 'SELECT pg_advisory_xact_lock($1, $2)' : 'SELECT pg_advisory_xact_lock_shared($1, $2)', [CHEIE_CASA, locatieId]);
}

/**
 * Momentul contabil al unei mișcări de numerar venite de pe tabletă: cel puțin deschiderea turei
 * evenimentului. Ceasul tabletei dat înapoi nu poate muta astfel banii (și corecția numărării) într-o
 * tură anterioară, deja închisă de altă baristă.
 * O tură creată automat n-are o deschidere numărată: momentul ei e doar primul eveniment ajuns pe
 * server (poate chiar închiderea, la o reaplicare), deci acolo rămâne ora evenimentului.
 */
export async function momentContabil(db: Db, turaId: string, la: string): Promise<string> {
  const r = await db.query<{ deschisa_la: string | Date }>('SELECT deschisa_la FROM ture WHERE id = $1 AND NOT creata_automat', [turaId]);
  const deschisa = r[0] ? new Date(r[0].deschisa_la).getTime() : -Infinity;
  return Date.parse(la) >= deschisa ? la : new Date(deschisa).toISOString();
}

export interface ContextPOS {
  locatie_id: number;
  dispozitiv_id: number | null;
}

/**
 * Tura e creată de evenimentul „tura_deschisa”; dacă acela s-a pierdut sau a fost respins,
 * o creăm aici ca vânzările să nu rămână fără tură. Adminul o vede marcată „creată automat”.
 */
export async function asiguraTura(db: Db, ctx: ContextPOS, turaId: string, la: string, utilizatorId: number) {
  const r = await db.query<{ locatie_id: number }>('SELECT locatie_id FROM ture WHERE id = $1', [turaId]);
  if (r[0]) {
    if (r[0].locatie_id !== ctx.locatie_id) throw new EroareUtilizator('Tura aparține altei locații');
    return;
  }
  await db.query(
    `INSERT INTO ture (id, locatie_id, dispozitiv_id, utilizator_id, deschisa_la, creata_automat)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [turaId, ctx.locatie_id, ctx.dispozitiv_id, utilizatorId, la],
  );
}

/** Numerarul care ar trebui să fie în sertar (registrul de bani al locației). */
export async function soldNumerar(db: Db, locatieId: number, pana?: string | Date): Promise<number> {
  const r = await db.query<{ sold: number }>(
    `SELECT COALESCE((SELECT s.sold FROM ${sqlSold(BANI, { n: '$2::bigint', locatie: '$1::int', dupa: "= 'numerar'", la: pana ? '$3::timestamptz' : undefined })} s), 0)::numeric AS sold`,
    [locatieId, await inchisPana(db, BANI), ...(pana ? [new Date(pana).toISOString()] : [])],
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
  // Numărarea citește registrul: nicio mișcare de numerar a locației nu se scrie în paralel.
  await blocheazaCasa(db, ctx.locatie_id, true);
  const existenta = (
    await db.query<{ locatie_id: number; inchisa_la: string | null; creata_automat: boolean }>(
      'SELECT locatie_id, inchisa_la, creata_automat FROM ture WHERE id = $1 FOR UPDATE',
      [d.tura_id],
    )
  )[0];
  if (existenta && existenta.locatie_id !== ctx.locatie_id) throw new EroareUtilizator('Tura aparține altei locații');
  // Tableta trimite deschiderea o singură dată, înaintea oricărei vânzări a turei. O a doua deschidere
  // ar rescrie fondul unei ture deja numărate (poate verificate). Rămâne permisă doar completarea unei
  // ture create automat (deschiderea respinsă și reaplicată de admin după vânzări sau după închidere).
  if (existenta && !existenta.creata_automat) throw new EroareUtilizator('Tura este deja deschisă');

  const anterioare = await db.query('SELECT 1 FROM ture WHERE locatie_id = $1 AND id <> $2 LIMIT 1', [ctx.locatie_id, d.tura_id]);
  const scriptic = await soldNumerar(db, ctx.locatie_id, la);
  const fond = rotunjeste(d.fond_initial);
  const dif = rotunjeste(fond - scriptic);
  const tol = await citesteTolerante(db);
  // Prima tură a unei case goale stabilește fondul de pornire. Dacă registrul avea deja bani
  // (o alimentare din panou), o diferență e o diferență și la prima tură.
  const fondDePornire = anterioare.length === 0 && scriptic === 0;
  const discrepanta = !fondDePornire && Math.abs(dif) > tol.numerar;

  if (existenta) {
    await db.query(
      `UPDATE ture SET utilizator_id = $2, deschisa_la = LEAST(deschisa_la, $3::timestamptz), fond_initial = $4, scriptic_fond = $5,
              creata_automat = false, are_discrepante = are_discrepante OR $6,
              modificata_dupa_verificare = ${MOMENT_MODIFICARE}
        WHERE id = $1`,
      [d.tura_id, d.utilizator_id, la, fond, scriptic, discrepanta],
    );
  } else {
    await db.query(
      `INSERT INTO ture (id, locatie_id, dispozitiv_id, utilizator_id, deschisa_la, fond_initial, scriptic_fond, are_discrepante)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [d.tura_id, ctx.locatie_id, ctx.dispozitiv_id, d.utilizator_id, la, fond, scriptic, discrepanta],
    );
  }
  if (fondDePornire) {
    await diferentaCasa(db, ctx.locatie_id, d.tura_id, dif, 'fond_initial', 'Fondul de pornire al casei', d.utilizator_id, la);
  } else {
    await diferentaCasa(db, ctx.locatie_id, d.tura_id, dif, 'diferenta_casa', 'Diferență la deschiderea turei', d.utilizator_id, la);
  }
  // Deschidere reaplicată după o numărare ulterioară (de ex. închiderea acestei ture, care a aliniat deja
  // registrul): diferența, sau fondul de pornire al primei ture a locației, a fost absorbită acolo; o scoatem
  // de acolo, ca să conteze o singură dată. Fără numărare ulterioară nu face nimic.
  await corecteazaNumarariUlterioare(db, ctx.locatie_id, la, dif, d.utilizator_id);
}

export async function plataMarunta(db: Db, ctx: ContextPOS, la: string, d: DatePlataMarunta): Promise<void> {
  if (!(d.suma > 0)) throw new EroareUtilizator('Suma plății trebuie să fie pozitivă');
  await blocheazaCasa(db, ctx.locatie_id);
  await asiguraTura(db, ctx, d.tura_id, la, d.utilizator_id);
  const suma = -rotunjeste(d.suma);
  const laContabil = await momentContabil(db, d.tura_id, la);
  await db.query(
    `INSERT INTO miscari_bani (locatie_id, cont, suma, tip, descriere, tura_id, utilizator_id, creata_la)
     VALUES ($1, 'numerar', $2, 'plata_marunta', $3, $4, $5, $6)`,
    [ctx.locatie_id, suma, d.descriere, d.tura_id, d.utilizator_id, laContabil],
  );
  await corecteazaNumarariUlterioare(db, ctx.locatie_id, laContabil, suma, d.utilizator_id);
}

/**
 * O mișcare de numerar datată înaintea unei numărări deja aplicate (vânzare offline ajunsă
 * după închiderea turei, eveniment reaplicat de admin): banii erau fizic în sertar la numărare,
 * deci alinierea de atunci a fost greșită exact cu această sumă. Corectăm prima numărare de după
 * mișcare, scripticul turei ei și semnalarea discrepanțelor; numărările următoare au pornit de la
 * un registru deja aliniat, deci rămân corecte.
 */
export async function corecteazaNumarariUlterioare(db: Db, locatieId: number, la: string, suma: number, utilizatorId: number | null): Promise<void> {
  if (suma === 0) return;
  // O numărare în curs (deschidere/închidere de tură) ține cheia exclusiv: o așteptăm, ca să o vedem.
  await blocheazaCasa(db, locatieId);
  const n = (
    await db.query<{ id: string; fel: 'deschidere' | 'inchidere'; cand: string }>(
      `SELECT id, fel, cand FROM (
         SELECT id, 'deschidere' AS fel, deschisa_la AS cand FROM ture WHERE locatie_id = $1 AND scriptic_fond IS NOT NULL AND deschisa_la > $2::timestamptz
         UNION ALL
         SELECT id, 'inchidere' AS fel, inchisa_la AS cand FROM ture WHERE locatie_id = $1 AND inchisa_la > $2::timestamptz
       ) x ORDER BY cand LIMIT 1`,
      [locatieId, la],
    )
  )[0];
  if (!n) return;
  await db.query(
    `INSERT INTO miscari_bani (locatie_id, cont, suma, tip, descriere, tura_id, document_tip, document_id, utilizator_id, creata_la)
     VALUES ($1, 'numerar', $2, 'diferenta_casa', 'Corecție: mișcare de numerar sincronizată după numărare', $3, 'tura', $4, $5, $6)`,
    [locatieId, -suma, n.id, n.id, utilizatorId, n.cand],
  );
  if (n.fel === 'deschidere') await db.query('UPDATE ture SET scriptic_fond = scriptic_fond + $2 WHERE id = $1', [n.id, suma]);
  else await db.query('UPDATE ture SET scriptic_numerar = scriptic_numerar + $2 WHERE id = $1', [n.id, suma]);
  await reevalueazaDiscrepante(db, n.id);
}

/**
 * Momentul unei modificări pe o tură deja verificată. clock_timestamp(), nu now(): now() e începutul
 * tranzacției, care poate preceda verificarea adminului validată între timp (READ COMMITTED: UPDATE-ul
 * vede deja verificata_la). Modificarea ar părea atunci făcută înainte de verificare și tura n-ar mai
 * ieși la verificare.
 */
const MOMENT_MODIFICARE = `CASE WHEN verificata_la IS NOT NULL THEN GREATEST(clock_timestamp(), verificata_la + interval '1 microsecond')
            ELSE modificata_dupa_verificare END`;

/** Recalculează semnalarea discrepanțelor din valorile declarate și scriptice ale turei. */
export async function reevalueazaDiscrepante(db: Db, turaId: string): Promise<void> {
  const t = (await db.query<any>('SELECT * FROM ture WHERE id = $1', [turaId]))[0];
  if (!t) return;
  const tol = await citesteTolerante(db);
  const fondDePornire = (await db.query(`SELECT 1 FROM miscari_bani WHERE tura_id = $1 AND tip = 'fond_initial'`, [turaId])).length > 0;
  let d = !fondDePornire && t.scriptic_fond != null && Math.abs(t.fond_initial - t.scriptic_fond) > tol.numerar;
  if (t.inchisa_la) {
    d =
      d ||
      Math.abs(t.declarat_numerar - t.scriptic_numerar) > tol.numerar ||
      Math.abs(t.declarat_card - t.scriptic_card) > tol.card ||
      Math.abs(t.declarat_doze - t.scriptic_doze) > tol.doze ||
      t.declarat_anulari !== t.scriptic_anulari ||
      t.declarat_casari !== t.scriptic_casari;
  }
  // O tură deja verificată ale cărei cifre se schimbă iese din nou la verificare (panou, filtrul „neverificate”).
  await db.query(
    `UPDATE ture SET are_discrepante = $2,
            modificata_dupa_verificare = ${MOMENT_MODIFICARE}
      WHERE id = $1`,
    [turaId, d],
  );
}

/**
 * O comandă sau o anulare ajunsă într-o tură deja închisă (tableta a rămas pe tura veche,
 * sincronizare târzie): refacem cifrele scriptice ale turei și semnalarea discrepanțelor.
 * Numerarul e tratat separat, prin corecteazaNumarariUlterioare.
 */
export async function actualizeazaTuraInchisa(db: Db, turaId: string): Promise<void> {
  const t = (await db.query<{ inchisa_la: string | null }>('SELECT inchisa_la FROM ture WHERE id = $1', [turaId]))[0];
  if (!t?.inchisa_la) return;
  const s = await scripticFaraNumerar(db, turaId);
  await db.query(
    'UPDATE ture SET scriptic_card = $2, scriptic_doze = $3, scriptic_anulari = $4, scriptic_casari = $5 WHERE id = $1',
    [turaId, s.scriptic_card, s.scriptic_doze, s.scriptic_anulari, s.scriptic_casari],
  );
  await reevalueazaDiscrepante(db, turaId);
}

export interface CalculTura {
  scriptic_numerar: number;
  scriptic_card: number;
  scriptic_doze: number;
  scriptic_anulari: number;
  scriptic_casari: number;
}

async function scripticFaraNumerar(db: Db, turaId: string): Promise<Omit<CalculTura, 'scriptic_numerar'>> {
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
    scriptic_card: rotunjeste(card[0].s),
    scriptic_doze: rotunjeste(doze[0].s),
    scriptic_anulari: anulari[0].s,
    scriptic_casari: casari[0].s,
  };
}

/** Ce „trebuia să fie” conform sistemului pentru o tură, până la momentul `la`. */
export async function calculeazaScriptic(db: Db, turaId: string, locatieId: number, la: string): Promise<CalculTura> {
  return { scriptic_numerar: await soldNumerar(db, locatieId, la), ...(await scripticFaraNumerar(db, turaId)) };
}

/**
 * Închiderea „oarbă” a turei: barista declară ce a numărat fără să vadă cifrele scriptice;
 * sistemul compară, aliniază registrul de numerar și ridică alerta pentru admin.
 */
export async function inchideTura(db: Db, ctx: ContextPOS, la: string, d: DateTuraInchisa): Promise<void> {
  await blocheazaCasa(db, ctx.locatie_id, true);
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

/** Tura n-a fost verificată sau s-a schimbat după verificare. */
export const NEVERIFICATA = '(t.verificata_la IS NULL OR t.modificata_dupa_verificare > t.verificata_la)';

const SELECT_TURA = `
  SELECT t.*, l.nume AS locatie, u.nume AS barista, ui.nume AS inchisa_de_nume, uv.nume AS verificata_de_nume,
         (t.declarat_numerar - t.scriptic_numerar) AS dif_numerar,
         (t.declarat_card - t.scriptic_card) AS dif_card,
         (t.declarat_doze - t.scriptic_doze) AS dif_doze,
         (t.declarat_anulari - t.scriptic_anulari) AS dif_anulari,
         (t.declarat_casari - t.scriptic_casari) AS dif_casari,
         CASE WHEN EXISTS (SELECT 1 FROM miscari_bani mb WHERE mb.tura_id = t.id AND mb.tip = 'fond_initial') THEN NULL
              ELSE (t.fond_initial - t.scriptic_fond) END AS dif_fond,
         (SELECT COALESCE(SUM(c.total), 0) FROM comenzi c WHERE c.tura_id = t.id AND c.stare = 'finalizata') AS vanzari,
         (SELECT COUNT(*) FROM comenzi c WHERE c.tura_id = t.id) AS nr_comenzi,
         (t.verificata_la IS NOT NULL AND t.modificata_dupa_verificare > t.verificata_la) AS modificata_dupa_verif
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
  if (f.neverificate) cond.push(NEVERIFICATA);
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
  // Vânzările pe card ale turei fără plată aprobată de terminal (Simulator, terminal fără legătură sau
  // aprobare care nu se poate confirma): pot explica o diferență la card.
  const [neconfirmat] = await db.query<{ nr: number; suma: number }>(
    `SELECT COUNT(*)::int AS nr, COALESCE(SUM(total), 0)::numeric AS suma FROM comenzi
      WHERE tura_id = $1 AND stare = 'finalizata' AND card_confirmat = false`,
    [id],
  );
  // Retururi pe card aprobate fără anularea comenzii: banii au plecat, dar vânzarea se numără încă la card.
  const retururi = await retururiNeanulate(db, { tura_id: id });
  return {
    ...t,
    bani,
    card_neconfirmat: { nr: neconfirmat.nr, suma: Number(neconfirmat.suma) },
    retur_neanulat: { nr: retururi.length, suma: rotunjeste(retururi.reduce((s, r) => s + r.suma, 0)), lista: retururi },
  };
}

export async function verificaTura(db: Db, id: string, utilizatorId: number, nota: string | null) {
  const r = await db.query(
    'UPDATE ture SET verificata_de = $2, verificata_la = now(), nota_verificare = $3 WHERE id = $1 RETURNING id',
    [id, utilizatorId, nota],
  );
  if (!r[0]) throw new EroareNegasit('Tura');
}
