import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db';
import { grupAdresa } from './acces';

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

// ---- Loginuri eșuate pentru conturi inexistente ----

interface ContorLogin {
  adresa: string | null;
  incercari: number;
  exemple: string[];
  /** Prima încercare încă nescrisă. */
  de_la: number;
  /** Ultima scriere a unui rând pentru acest grup. */
  scris: number;
}

/**
 * Eșecurile pe conturi inexistente nu se scriu câte unul: oricine le poate produce fără cont, iar
 * numele inventate trec de pauzele de la login (fiecare nume e altă cheie), deci un singur client
 * ar scrie zeci de rânduri pe secundă într-un tabel din care nu se șterge nimic. Se numără în memorie,
 * pe grup de adrese (IPv6 pe /64, ca la pauze), și se scrie cel mult un rând pe grup pe minut
 * (`login.esuat.necunoscut`, cu numărul de încercări și primele nume încercate). Prima încercare a
 * unui grup se scrie imediat. Dacă multe adrese diferite depășesc împreună MAX_RANDURI_PE_MINUT,
 * restul se adună într-un singur rând comun pe minut. Eșecurile pe conturi reale rămân rânduri
 * separate (`login.esuat`): sunt deja limitate de pauzele pe cont și pe adresă.
 */
export class JurnalLoginNecunoscut {
  static readonly INTERVAL = 60_000;
  static readonly MAX_RANDURI_PE_MINUT = 20;
  static readonly EXEMPLE = 3;
  private static readonly COMUN = '*';

  private grupuri = new Map<string, ContorLogin>();
  private minut = { inceput: 0, randuri: 0 };
  private ultimaScanare = 0;

  constructor(private maxGrupuri = 10_000) {}

  /** Numără un eșec; întoarce rândurile de scris acum (de cele mai multe ori niciunul). */
  esec(adresa: string, login: string, acum = Date.now()): IntrareAudit[] {
    const randuri: IntrareAudit[] = [];
    const grup = grupAdresa(adresa);
    let c = this.grupuri.get(grup);
    if (!c) {
      if (this.grupuri.size >= this.maxGrupuri) this.elibereaza();
      c = { adresa, incercari: 0, exemple: [], de_la: acum, scris: -Infinity };
      this.grupuri.set(grup, c);
    }
    if (c.incercari === 0) c.de_la = acum;
    c.incercari += 1;
    c.adresa = adresa;
    if (c.exemple.length < JurnalLoginNecunoscut.EXEMPLE && !c.exemple.includes(login)) c.exemple.push(login.slice(0, 60));
    if (acum - c.scris >= JurnalLoginNecunoscut.INTERVAL) this.scrie(grup, c, acum, randuri);
    // Ce a rămas nescris la alte grupuri pleacă la următorul eșec, oricare ar fi el.
    if (acum - this.ultimaScanare >= JurnalLoginNecunoscut.INTERVAL / 4) {
      this.ultimaScanare = acum;
      for (const [g, x] of this.grupuri) {
        if (x.incercari > 0 && acum - x.scris >= JurnalLoginNecunoscut.INTERVAL) this.scrie(g, x, acum, randuri);
        else if (x.incercari === 0 && acum - x.scris >= JurnalLoginNecunoscut.INTERVAL) this.grupuri.delete(g);
      }
    }
    return randuri;
  }

  /** Câte grupuri ține minte (pentru teste). */
  marime() {
    return this.grupuri.size;
  }

  private scrie(grup: string, c: ContorLogin, acum: number, randuri: IntrareAudit[]) {
    if (acum - this.minut.inceput >= JurnalLoginNecunoscut.INTERVAL) this.minut = { inceput: acum, randuri: 0 };
    if (grup !== JurnalLoginNecunoscut.COMUN && this.minut.randuri >= JurnalLoginNecunoscut.MAX_RANDURI_PE_MINUT) {
      // Prea multe adrese în același minut: încercările trec în rândul comun.
      this.adaugaLaComun(c, acum);
      c.scris = acum;
      return;
    }
    this.minut.randuri += 1;
    randuri.push({
      adresa: c.adresa,
      actiune: 'login.esuat.necunoscut',
      cale: '/api/auth/login',
      stare_http: 401,
      date: { incercari: c.incercari, exemple: c.exemple, de_la: new Date(c.de_la).toISOString() },
    });
    c.incercari = 0;
    c.exemple = [];
    c.scris = acum;
  }

  private adaugaLaComun(c: ContorLogin, acum: number) {
    let comun = this.grupuri.get(JurnalLoginNecunoscut.COMUN);
    if (!comun) {
      comun = { adresa: null, incercari: 0, exemple: [], de_la: acum, scris: acum };
      this.grupuri.set(JurnalLoginNecunoscut.COMUN, comun);
    }
    if (comun.incercari === 0) comun.de_la = Math.min(c.de_la, acum);
    comun.incercari += c.incercari;
    for (const e of c.exemple) if (comun.exemple.length < JurnalLoginNecunoscut.EXEMPLE) comun.exemple.push(e);
    c.incercari = 0;
    c.exemple = [];
  }

  /** Tabelul e plin: cele mai vechi grupuri pleacă, iar încercările lor nescrise trec în rândul comun. */
  private elibereaza() {
    const tinta = Math.floor(this.maxGrupuri * 0.9);
    for (const [g, c] of this.grupuri) {
      if (this.grupuri.size <= tinta) break;
      if (g === JurnalLoginNecunoscut.COMUN) continue;
      if (c.incercari > 0) this.adaugaLaComun(c, c.de_la);
      this.grupuri.delete(g);
    }
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
    let corpJurnal: unknown;
    if (req.auditCorp !== undefined) corpJurnal = req.auditCorp;
    else {
      const corp = redacteaza(req.body ?? null);
      const text = JSON.stringify(corp) ?? '';
      corpJurnal = text.length > MAX_CORP ? rezumat(corp, text.length) : corp;
    }
    const date: Record<string, unknown> = { corp: corpJurnal };
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
  /** Și autentificările eșuate (implicit ascunse: altfel un val de încercări acoperă modificările reale). */
  esecuriLogin?: boolean;
}

/** Ultimele intrări din jurnal (cel mult 500), opțional cu un text căutat oriunde în ele. */
export function listaJurnal(db: Db, f: FiltruJurnal = {}) {
  const params: unknown[] = [];
  const conditii: string[] = [];
  const cauta = f.cauta?.trim();
  if (cauta) {
    params.push(`%${cauta.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    conditii.push(`(j.actiune ILIKE $1 OR j.cale ILIKE $1 OR j.adresa ILIKE $1 OR u.nume ILIKE $1 OR u.login ILIKE $1
              OR d.nume ILIKE $1 OR j.date::text ILIKE $1)`);
  }
  if (!f.esecuriLogin) conditii.push(`j.actiune NOT LIKE 'login.esuat%'`);
  const unde = conditii.length ? `WHERE ${conditii.join(' AND ')}` : '';
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

/**
 * Pentru numărările de inventar: cererea poate avea mii de linii (un depozit), iar valorile numărate
 * se suprascriu până la finalizare. În jurnal ajung doar liniile care se schimbă, compact
 * ([articol_id, faptic]), cu valorile lor de dinainte; liniile retrimise neschimbate doar se numără.
 * Așa o numărătoare schimbată înainte de finalizare rămâne urmăribilă oricât de mare e lista.
 */
export async function auditNumaratori(
  db: Db,
  inventariereId: number,
  linii: { articol_id: number; faptic: number | null }[],
): Promise<{ corp: unknown; inainte: unknown }> {
  const existente = await db.query<{ articol_id: number; faptic: string | number | null }>(
    'SELECT articol_id, faptic FROM inventarieri_linii WHERE inventariere_id = $1',
    [inventariereId],
  );
  const vechi = new Map(existente.map((r) => [Number(r.articol_id), r.faptic == null ? null : Number(r.faptic)]));
  const schimbate: [number, number | null][] = [];
  const inainte: [number, number | null][] = [];
  for (const l of linii) {
    const v = vechi.get(l.articol_id) ?? null;
    if (v === l.faptic) continue;
    schimbate.push([l.articol_id, l.faptic]);
    inainte.push([l.articol_id, v]);
  }
  return {
    corp: { inventariere_id: inventariereId, linii_trimise: linii.length, schimbate },
    inainte: { linii: inainte },
  };
}
