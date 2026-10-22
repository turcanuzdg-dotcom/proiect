import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { hashPin } from '@cafenea/shared';
import type { Db } from '../db';
import { EroareNegasit, EroareUtilizator } from '../erori';

const ZILE_SESIUNE = 7;
const scryptAsync = promisify(scrypt) as (parola: string, sare: string, lungime: number) => Promise<Buffer>;

export const sareNoua = () => randomBytes(8).toString('hex');
export const tokenNou = () => randomBytes(24).toString('base64url');

// Fără caractere care se confundă la tastare (0/O, 1/I/L).
const ALFABET_COD = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const codAsociere = () => Array.from(randomBytes(8), (b) => ALFABET_COD[b % ALFABET_COD.length]).join('');

/** scrypt rulează în afara firului principal, ca un val de încercări de login să nu blocheze API-ul. */
export async function hashParola(parola: string, sare: string): Promise<string> {
  return (await scryptAsync(parola, sare, 32)).toString('hex');
}

async function parolaCorecta(parola: string, sare: string, hash: string): Promise<boolean> {
  const a = Buffer.from(await hashParola(parola, sare), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface UtilizatorAutentificat {
  id: number;
  nume: string;
  rol: 'admin' | 'barista';
}

// Încercări eșuate pe (adresă, login): după 5, o pauză care se dublează la fiecare eșec următor.
const esecuri = new Map<string, { nr: number; pana: number }>();
const SARE_FALSA = 'sare-pentru-conturi-inexistente';

function verificaBlocare(cheie: string) {
  const e = esecuri.get(cheie);
  if (e && e.pana > Date.now()) {
    throw new EroareUtilizator(`Prea multe încercări; reîncercați în ${Math.ceil((e.pana - Date.now()) / 1000)} s`, 429);
  }
}

function noteazaEsec(cheie: string) {
  const e = esecuri.get(cheie) ?? { nr: 0, pana: 0 };
  e.nr += 1;
  if (e.nr >= 5) e.pana = Date.now() + Math.min(30_000 * 2 ** (e.nr - 5), 15 * 60_000);
  esecuri.set(cheie, e);
  if (esecuri.size > 10_000) esecuri.clear();
}

export async function autentificare(db: Db, login: string, parola: string, adresa = '') {
  const cheie = `${adresa}|${login.toLowerCase()}`;
  verificaBlocare(cheie);
  const u = (await db.query<any>('SELECT * FROM utilizatori WHERE login = $1 AND activ', [login]))[0];
  // Pentru un cont inexistent facem totuși un hash, ca durata răspunsului să nu dea de gol loginurile valide.
  const corect = u?.parola_hash ? await parolaCorecta(parola, u.sare, u.parola_hash) : (await hashParola(parola, SARE_FALSA), false);
  if (!corect) {
    noteazaEsec(cheie);
    throw new EroareUtilizator('Utilizator sau parolă greșită', 401);
  }
  if (u.rol !== 'admin') throw new EroareUtilizator('Doar administratorii au acces la panou', 403);
  esecuri.delete(cheie);
  const token = tokenNou();
  await db.query(`INSERT INTO sesiuni (token, utilizator_id, expira_la) VALUES ($1, $2, now() + interval '${ZILE_SESIUNE} days')`, [token, u.id]);
  return { token, utilizator: { id: u.id, nume: u.nume, rol: u.rol } as UtilizatorAutentificat };
}

export async function utilizatorDinToken(db: Db, token: string): Promise<UtilizatorAutentificat | null> {
  const r = await db.query<UtilizatorAutentificat>(
    `SELECT u.id, u.nume, u.rol FROM sesiuni s JOIN utilizatori u ON u.id = s.utilizator_id
      WHERE s.token = $1 AND s.expira_la > now() AND u.activ`,
    [token],
  );
  if (!r[0]) return null;
  // Sesiune glisantă: cât timp panoul e folosit, nu expiră în mijlocul lucrului.
  await db.query(`UPDATE sesiuni SET expira_la = now() + interval '${ZILE_SESIUNE} days' WHERE token = $1 AND expira_la < now() + interval '3 days'`, [token]);
  return r[0];
}

export async function iesire(db: Db, token: string) {
  await db.query('DELETE FROM sesiuni WHERE token = $1', [token]);
}

// ---- Bilete pentru fluxul de notificări (SSE) ----
// EventSource nu poate trimite antete, iar tokenul de sesiune nu trebuie să ajungă în URL-uri
// (jurnalele serverului și ale proxy-ului). Un bilet e scurt, aleator și valabil un minut.

interface Bilet {
  utilizator?: UtilizatorAutentificat;
  dispozitiv?: DispozitivAutentificat;
  expira: number;
}
const bilete = new Map<string, Bilet>();

export function creeazaBilet(detinator: { utilizator?: UtilizatorAutentificat; dispozitiv?: DispozitivAutentificat }): string {
  const acum = Date.now();
  for (const [b, v] of bilete) if (v.expira < acum) bilete.delete(b);
  const bilet = tokenNou();
  bilete.set(bilet, { ...detinator, expira: acum + 60_000 });
  return bilet;
}

export function detinatorBilet(bilet: string): Bilet | null {
  const b = bilete.get(bilet);
  if (!b || b.expira < Date.now()) return null;
  return b;
}

// ---- Tablete (dispozitive POS) ----

export interface DispozitivAutentificat {
  id: number;
  nume: string;
  locatie_id: number;
}

export async function dispozitivDinToken(db: Db, token: string): Promise<DispozitivAutentificat | null> {
  const r = await db.query<DispozitivAutentificat>(
    'SELECT id, nume, locatie_id FROM dispozitive WHERE token = $1 AND activ',
    [token],
  );
  return r[0] ?? null;
}

/** Adminul creează tableta și primește un cod de asociere de 8 caractere, valabil o singură dată. */
export async function creeazaDispozitiv(db: Db, nume: string, locatieId: number) {
  const r = await db.query('INSERT INTO dispozitive (nume, locatie_id, cod_asociere) VALUES ($1, $2, $3) RETURNING *', [nume, locatieId, codAsociere()]);
  return r[0];
}

export async function asociazaDispozitiv(db: Db, cod: string) {
  const token = tokenNou();
  const r = await db.query<any>(
    `UPDATE dispozitive SET token = $2, cod_asociere = NULL WHERE cod_asociere = $1 AND activ
     RETURNING id, nume, locatie_id`,
    [cod.trim().toUpperCase(), token],
  );
  if (!r[0]) throw new EroareUtilizator('Cod de asociere greșit sau deja folosit', 401);
  return { token, dispozitiv: r[0] as DispozitivAutentificat };
}

/** Generează un cod nou (de ex. tableta a fost resetată); tokenul vechi nu mai funcționează. */
export async function reasociazaDispozitiv(db: Db, id: number) {
  const r = await db.query('UPDATE dispozitive SET cod_asociere = $2, token = NULL WHERE id = $1 RETURNING *', [id, codAsociere()]);
  if (!r[0]) throw new EroareNegasit('Tableta');
  return r[0];
}

export function listaDispozitive(db: Db) {
  return db.query(
    `SELECT d.id, d.nume, d.locatie_id, l.nume AS locatie, d.cod_asociere, d.activ, d.creat_la, d.ultima_sincronizare,
            d.terminal_device_id, d.token IS NOT NULL AS asociat
       FROM dispozitive d JOIN locatii l ON l.id = d.locatie_id ORDER BY l.nume, d.nume`,
  );
}

export async function activeazaDispozitiv(db: Db, id: number, activ: boolean) {
  await db.query('UPDATE dispozitive SET activ = $2 WHERE id = $1', [id, activ]);
}

/**
 * Utilizatorul pe care îl poate declara o tabletă: are PIN și lucrează în locația ei (sau în
 * toate), exact regula după care catalogul îi trimite tabletei lista. Un utilizator dezactivat
 * între timp rămâne valabil, ca vânzările făcute offline înainte de dezactivare să se aplice.
 */
export async function utilizatorPermisTabletei(db: Db, utilizatorId: number, locatieId: number): Promise<void> {
  const r = await db.query(
    'SELECT 1 FROM utilizatori WHERE id = $1 AND pin_hash IS NOT NULL AND (locatie_id IS NULL OR locatie_id = $2)',
    [utilizatorId, locatieId],
  );
  if (!r.length) throw new EroareUtilizator(`Utilizatorul ${utilizatorId} nu lucrează în această locație`);
}

// ---- Utilizatori ----

export interface DateUtilizator {
  nume: string;
  rol: 'admin' | 'barista';
  login?: string | null;
  parola?: string | null;
  pin?: string | null;
  locatie_id?: number | null;
  activ?: boolean;
}

export function listaUtilizatori(db: Db) {
  return db.query(
    `SELECT u.id, u.nume, u.rol, u.login, u.locatie_id, l.nume AS locatie, u.activ,
            u.pin_hash IS NOT NULL AS are_pin, u.parola_hash IS NOT NULL AS are_parola
       FROM utilizatori u LEFT JOIN locatii l ON l.id = u.locatie_id ORDER BY u.rol, u.nume`,
  );
}

/**
 * @param sesiuneCurenta tokenul celui care face modificarea: la schimbarea propriei parole,
 *   celelalte sesiuni sunt închise, dar a lui rămâne.
 */
export async function salveazaUtilizator(db: Db, d: DateUtilizator, id?: number, sesiuneCurenta?: string) {
  if (d.pin != null && !/^\d{4,6}$/.test(d.pin)) throw new EroareUtilizator('PIN-ul are 4–6 cifre');
  if (d.parola != null && d.parola.length < 8) throw new EroareUtilizator('Parola are cel puțin 8 caractere');
  if (d.parola != null && d.parola.length > 200) throw new EroareUtilizator('Parola e prea lungă');
  const existent = id ? (await db.query<{ sare: string; parola_hash: string | null }>('SELECT sare, parola_hash FROM utilizatori WHERE id = $1', [id]))[0] : null;
  if (id && !existent) throw new EroareNegasit('Utilizatorul');
  if (d.rol === 'admin' && !d.login) throw new EroareUtilizator('Administratorul are nevoie de un nume de utilizator');
  if (d.rol === 'admin' && !d.parola && !existent?.parola_hash) throw new EroareUtilizator('Administratorul are nevoie de o parolă');
  const sare = existent?.sare ?? sareNoua();
  const parolaHash = d.parola ? await hashParola(d.parola, sare) : null;
  const pinHash = d.pin ? hashPin(d.pin, sare) : null;
  if (id) {
    await db.query(
      `UPDATE utilizatori SET nume = $2, rol = $3, login = $4, locatie_id = $5, activ = $6,
              parola_hash = COALESCE($7, parola_hash), pin_hash = COALESCE($8, pin_hash)
        WHERE id = $1`,
      [id, d.nume, d.rol, d.login || null, d.locatie_id ?? null, d.activ ?? true, parolaHash, pinHash],
    );
    // Parola schimbată, cont dezactivat sau retrogradat: sesiunile vechi nu mai sunt valabile.
    if (d.activ === false || d.rol !== 'admin') await db.query('DELETE FROM sesiuni WHERE utilizator_id = $1', [id]);
    else if (parolaHash) await db.query('DELETE FROM sesiuni WHERE utilizator_id = $1 AND token IS DISTINCT FROM $2', [id, sesiuneCurenta ?? null]);
    return { id };
  }
  const r = await db.query<{ id: number }>(
    `INSERT INTO utilizatori (nume, rol, login, parola_hash, pin_hash, sare, locatie_id, activ)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [d.nume, d.rol, d.login || null, parolaHash, pinHash, sare, d.locatie_id ?? null, d.activ ?? true],
  );
  return r[0];
}

// ---- Locații ----

export function listaLocatii(db: Db) {
  return db.query('SELECT * FROM locatii ORDER BY tip, id');
}

export async function salveazaLocatie(db: Db, d: { nume: string; tip: 'depozit' | 'punct'; activ?: boolean }, id?: number) {
  if (id) {
    const r = await db.query('UPDATE locatii SET nume = $2, tip = $3, activ = $4 WHERE id = $1 RETURNING *', [id, d.nume, d.tip, d.activ ?? true]);
    if (!r[0]) throw new EroareNegasit('Locația');
    return r[0];
  }
  return (await db.query('INSERT INTO locatii (nume, tip) VALUES ($1, $2) RETURNING *', [d.nume, d.tip]))[0];
}
