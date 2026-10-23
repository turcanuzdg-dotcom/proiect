import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db';

// Jurnalul de audit: cine a schimbat ce, de unde și când. Se scrie după răspuns, pentru orice cerere
// care modifică ceva în panou sau de pe tabletă (în afară de /api/pos/sync, ale cărui evenimente se
// păstrează oricum în evenimente_sync), plus autentificările. Tabelul nu se poate modifica sau șterge.

export interface IntrareAudit {
  utilizator_id?: number | null;
  dispozitiv_id?: number | null;
  adresa?: string | null;
  actiune: string;
  cale?: string | null;
  stare_http?: number | null;
  date?: unknown;
}

interface Jurnal {
  error(obiect: unknown, mesaj?: string): void;
}

/** Chei care nu ajung niciodată în jurnal: parole, PIN-uri, coduri de asociere, tokenuri, chei, hash-uri. */
const SECRET = /^(parola|pin|cod|token|cheie|bilet|secret)(_|$)|_(hash|token)$/i;
/** Peste atât, corpul cererii se păstrează doar pe scurt (de ex. inventarieri cu sute de linii). */
const MAX_CORP = 16 * 1024;

export function redacteaza(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redacteaza);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET.test(k) ? (x == null ? x : '***') : redacteaza(x)]));
  }
  return v;
}

/** Corpul unei cereri mari, pe scurt: valorile simple rămân, listele devin numărul de elemente. */
function rezumat(corp: unknown, octeti: number): unknown {
  if (!corp || typeof corp !== 'object' || Array.isArray(corp)) return { trunchiat: true, octeti };
  const r: Record<string, unknown> = { trunchiat: true, octeti };
  for (const [k, v] of Object.entries(corp)) {
    if (Array.isArray(v)) r[k] = { elemente: v.length };
    else if (v === null || typeof v !== 'object') r[k] = typeof v === 'string' ? v.slice(0, 200) : v;
  }
  return r;
}

/** Scrie o intrare. Nu aruncă niciodată: un jurnal care nu merge nu oprește cererea, doar se raportează. */
export async function auditeaza(db: Db, i: IntrareAudit, jurnal?: Jurnal): Promise<void> {
  try {
    // PostgreSQL nu acceptă NUL în jsonb; restul se păstrează exact.
    const date = i.date === undefined ? null : JSON.stringify(i.date).replace(/\\u0000/g, '');
    await db.query(
      `INSERT INTO jurnal_audit (utilizator_id, dispozitiv_id, adresa, actiune, cale, stare_http, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [i.utilizator_id ?? null, i.dispozitiv_id ?? null, i.adresa ?? null, i.actiune.slice(0, 200), i.cale?.slice(0, 500) ?? null, i.stare_http ?? null, date],
    );
  } catch (e) {
    (jurnal ?? { error: console.error }).error({ err: e, actiune: i.actiune }, 'Jurnalul de audit nu a putut fi scris');
  }
}

const RUTE_FARA_AUDIT = new Set(['/api/pos/sync', '/api/auth/login']);

/**
 * Hook `onResponse` pentru un grup de rute: scrie în jurnal fiecare cerere care nu e de citire,
 * făcută de un admin sau de o tabletă autentificată. Cererile respinse la autentificare (401) nu se
 * scriu, ca un val de cereri anonime să nu umple jurnalul; loginurile se scriu separat (cu numele).
 */
export function hookAudit(db: Db) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (!req.utilizator && !req.dispozitiv) return;
    const cale = req.url.split('?')[0];
    const ruta = req.routeOptions?.url ?? cale;
    if (RUTE_FARA_AUDIT.has(ruta)) return;
    const corp = redacteaza(req.body ?? null);
    const text = JSON.stringify(corp) ?? '';
    const date: Record<string, unknown> = { corp: text.length > MAX_CORP ? rezumat(corp, text.length) : corp };
    if (req.auditInainte !== undefined) date.inainte = req.auditInainte;
    await auditeaza(
      db,
      {
        utilizator_id: req.utilizator?.id,
        dispozitiv_id: req.dispozitiv?.id,
        adresa: req.ip,
        actiune: `${req.method} ${ruta}`,
        cale,
        stare_http: reply.statusCode,
        date,
      },
      req.log,
    );
  };
}

// ---- Starea de dinainte, pentru cererile care suprascriu ----
// Corpul cererii are doar valoarea nouă; fără „înainte”, prima modificare după punerea în funcțiune
// n-ar mai putea fi urmărită (de ex. toleranța de casă ridicată de la 5 la 500 lei, rețeta schimbată).
// Niciodată hash-uri de parolă sau PIN și niciodată tokenuri.

export type TipInstantaneu = 'setare' | 'produs' | 'modificator' | 'articol' | 'dispozitiv' | 'utilizator' | 'tura' | 'locatie' | 'categorie';

export async function stareAnterioara(db: Db, tip: TipInstantaneu, cheie: string | number): Promise<unknown> {
  const unu = async (sql: string) => (await db.query(sql, [cheie]))[0] ?? null;
  switch (tip) {
    case 'setare':
      return (await unu('SELECT valoare FROM setari WHERE cheie = $1'))?.valoare ?? null;
    case 'produs': {
      const p = await unu('SELECT id, nume, categorie_id, pret, doze_cafea, ordine, activ, cota_tva FROM produse WHERE id = $1');
      if (!p) return null;
      const reteta = await db.query('SELECT articol_id, cantitate FROM retete WHERE produs_id = $1 ORDER BY articol_id', [cheie]);
      const mods = await db.query<{ modificator_id: number }>('SELECT modificator_id FROM produse_modificatori WHERE produs_id = $1 ORDER BY modificator_id', [cheie]);
      return { ...p, reteta, modificatori: mods.map((m) => m.modificator_id) };
    }
    case 'modificator': {
      const m = await unu('SELECT id, nume, pret, doze_cafea, inlocuieste_articol_id, inlocuitor_articol_id, activ FROM modificatori WHERE id = $1');
      if (!m) return null;
      return { ...m, adauga: await db.query('SELECT articol_id, cantitate FROM modificatori_linii WHERE modificator_id = $1 ORDER BY articol_id', [cheie]) };
    }
    case 'articol':
      return unu('SELECT id, nume, um, tip, prag_minim, activ, cost_mediu FROM articole WHERE id = $1');
    case 'dispozitiv':
      return unu('SELECT id, nume, locatie_id, activ, terminal_device_id, token IS NOT NULL AS asociat FROM dispozitive WHERE id = $1');
    case 'utilizator':
      return unu(
        `SELECT id, nume, rol, login, locatie_id, activ, pin_hash IS NOT NULL AS are_pin, parola_hash IS NOT NULL AS are_parola
           FROM utilizatori WHERE id = $1`,
      );
    case 'tura':
      return unu('SELECT id, verificata_de, verificata_la, nota_verificare FROM ture WHERE id = $1');
    case 'locatie':
      return unu('SELECT id, nume, tip, activ FROM locatii WHERE id = $1');
    case 'categorie':
      return unu('SELECT id, nume, ordine FROM categorii WHERE id = $1');
  }
}

export interface FiltruJurnal {
  cauta?: string;
  limita?: number;
}

/** Ultimele intrări din jurnal (cel mult 500), opțional cu un text căutat oriunde în ele. */
export function listaJurnal(db: Db, f: FiltruJurnal = {}) {
  const params: unknown[] = [];
  let unde = '';
  const cauta = f.cauta?.trim();
  if (cauta) {
    params.push(`%${cauta.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    unde = `WHERE j.actiune ILIKE $1 OR j.cale ILIKE $1 OR j.adresa ILIKE $1 OR u.nume ILIKE $1 OR u.login ILIKE $1
              OR d.nume ILIKE $1 OR j.date::text ILIKE $1`;
  }
  params.push(Math.min(Math.max(f.limita ?? 500, 1), 500));
  return db.query(
    `SELECT j.id, j.la, j.utilizator_id, u.nume AS utilizator, j.dispozitiv_id, d.nume AS dispozitiv, l.nume AS locatie,
            j.adresa, j.actiune, j.cale, j.stare_http, j.date
       FROM jurnal_audit j
       LEFT JOIN utilizatori u ON u.id = j.utilizator_id
       LEFT JOIN dispozitive d ON d.id = j.dispozitiv_id
       LEFT JOIN locatii l ON l.id = d.locatie_id
       ${unde}
      ORDER BY j.la DESC, j.id DESC
      LIMIT $${params.length}`,
    params,
  );
}
