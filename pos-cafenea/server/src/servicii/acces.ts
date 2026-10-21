import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { hashPin } from '@cafenea/shared';
import type { Db } from '../db';
import { EroareNegasit, EroareUtilizator } from '../erori';

const ZILE_SESIUNE = 7;

export const sareNoua = () => randomBytes(8).toString('hex');

// Fără caractere care se confundă la tastare (0/O, 1/I/L).
const ALFABET_COD = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const codAsociere = () => Array.from(randomBytes(8), (b) => ALFABET_COD[b % ALFABET_COD.length]).join('');
export const tokenNou = () => randomBytes(24).toString('base64url');

export function hashParola(parola: string, sare: string): string {
  return scryptSync(parola, sare, 32).toString('hex');
}

function parolaCorecta(parola: string, sare: string, hash: string): boolean {
  const a = Buffer.from(hashParola(parola, sare), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface UtilizatorAutentificat {
  id: number;
  nume: string;
  rol: 'admin' | 'barista';
}

export async function autentificare(db: Db, login: string, parola: string) {
  const u = (await db.query<any>('SELECT * FROM utilizatori WHERE login = $1 AND activ', [login]))[0];
  if (!u || !u.parola_hash || !parolaCorecta(parola, u.sare, u.parola_hash)) {
    throw new EroareUtilizator('Utilizator sau parolă greșită', 401);
  }
  if (u.rol !== 'admin') throw new EroareUtilizator('Doar administratorii au acces la panou', 403);
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
  return r[0] ?? null;
}

export async function iesire(db: Db, token: string) {
  await db.query('DELETE FROM sesiuni WHERE token = $1', [token]);
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
  const cod = codAsociere();
  const r = await db.query('INSERT INTO dispozitive (nume, locatie_id, cod_asociere) VALUES ($1, $2, $3) RETURNING *', [nume, locatieId, cod]);
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
  const cod = codAsociere();
  const r = await db.query('UPDATE dispozitive SET cod_asociere = $2, token = NULL WHERE id = $1 RETURNING *', [id, cod]);
  if (!r[0]) throw new EroareNegasit('Tableta');
  return r[0];
}

export function listaDispozitive(db: Db) {
  return db.query(
    `SELECT d.id, d.nume, d.locatie_id, l.nume AS locatie, d.cod_asociere, d.activ, d.creat_la, d.ultima_sincronizare,
            d.token IS NOT NULL AS asociat
       FROM dispozitive d JOIN locatii l ON l.id = d.locatie_id ORDER BY l.nume, d.nume`,
  );
}

export async function activeazaDispozitiv(db: Db, id: number, activ: boolean) {
  await db.query('UPDATE dispozitive SET activ = $2 WHERE id = $1', [id, activ]);
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
    `SELECT u.id, u.nume, u.rol, u.login, u.locatie_id, l.nume AS locatie, u.activ, u.pin_hash IS NOT NULL AS are_pin
       FROM utilizatori u LEFT JOIN locatii l ON l.id = u.locatie_id ORDER BY u.rol, u.nume`,
  );
}

export async function salveazaUtilizator(db: Db, d: DateUtilizator, id?: number) {
  if (d.pin != null && !/^\d{4,6}$/.test(d.pin)) throw new EroareUtilizator('PIN-ul are 4–6 cifre');
  if (d.rol === 'admin' && !id && !(d.login && d.parola)) throw new EroareUtilizator('Administratorul are nevoie de login și parolă');
  if (d.parola != null && d.parola.length < 8) throw new EroareUtilizator('Parola are cel puțin 8 caractere');
  const sare = id ? (await db.query<{ sare: string }>('SELECT sare FROM utilizatori WHERE id = $1', [id]))[0]?.sare : sareNoua();
  if (!sare) throw new EroareNegasit('Utilizatorul');
  const parolaHash = d.parola ? hashParola(d.parola, sare) : null;
  const pinHash = d.pin ? hashPin(d.pin, sare) : null;
  if (id) {
    await db.query(
      `UPDATE utilizatori SET nume = $2, rol = $3, login = $4, locatie_id = $5, activ = $6,
              parola_hash = COALESCE($7, parola_hash), pin_hash = COALESCE($8, pin_hash)
        WHERE id = $1`,
      [id, d.nume, d.rol, d.login || null, d.locatie_id ?? null, d.activ ?? true, parolaHash, pinHash],
    );
    if (d.activ === false) await db.query('DELETE FROM sesiuni WHERE utilizator_id = $1', [id]);
    return { id };
  }
  const r = await db.query<{ id: number }>(
    `INSERT INTO utilizatori (nume, rol, login, parola_hash, pin_hash, sare, locatie_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [d.nume, d.rol, d.login || null, parolaHash, pinHash, sare, d.locatie_id ?? null],
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
