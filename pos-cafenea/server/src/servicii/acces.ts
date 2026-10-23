import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { hashPin, sha256Hex } from '@cafenea/shared';
import type { Db } from '../db';
import { EroareNegasit, EroareUtilizator } from '../erori';

const ZILE_SESIUNE = 7;
/** Oricât de des ar fi folosită, o sesiune de panou ține cel mult atât; apoi adminul intră din nou. */
const ZILE_SESIUNE_MAXIM = 30;
const scryptAsync = promisify(scrypt) as (parola: string, sare: string, lungime: number) => Promise<Buffer>;

export const sareNoua = () => randomBytes(8).toString('hex');
export const tokenNou = () => randomBytes(24).toString('base64url');

/**
 * În bază se păstrează doar amprenta SHA-256 a tokenurilor (sesiuni și tablete): o copie a bazei
 * nu dă acces la panou sau la tablete. Tokenul are 192 de biți aleatori, deci nu are nevoie de sare.
 */
export const amprentaToken = (token: string) => sha256Hex(token);

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

// ---- Protecția loginului ----

/**
 * Cheia unei adrese pentru numărarea eșecurilor. IPv6 se grupează pe /64: un singur client (un VPS,
 * o casă) primește de obicei un /64 întreg și ar putea schimba adresa la fiecare încercare.
 */
export function grupAdresa(adresa: string): string {
  let a = adresa.trim().toLowerCase();
  const zona = a.indexOf('%');
  if (zona >= 0) a = a.slice(0, zona);
  const mapata = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapata) return mapata[1];
  if (!a.includes(':')) return a;
  const grupuri = (parte: string) => {
    const g = parte ? parte.split(':') : [];
    // O adresă IPv4 la coadă (::1.2.3.4) ocupă ultimele două grupuri.
    const ultim = g[g.length - 1];
    if (ultim?.includes('.')) {
      const o = ultim.split('.').map(Number);
      g.splice(g.length - 1, 1, ((o[0] << 8) | o[1]).toString(16), ((o[2] << 8) | o[3]).toString(16));
    }
    return g;
  };
  const [cap, coada] = a.split('::');
  const inceput = grupuri(cap);
  const sfarsit = coada === undefined ? [] : grupuri(coada);
  const zerouri = coada === undefined ? 0 : Math.max(0, 8 - inceput.length - sfarsit.length);
  const toate = [...inceput, ...Array(zerouri).fill('0'), ...sfarsit];
  if (toate.length !== 8 || toate.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return a;
  return `${toate.slice(0, 4).map((x) => parseInt(x, 16).toString(16)).join(':')}::/64`;
}

export interface OptiuniProtectie {
  /** Câte chei (adresă+login, login, adrese cunoscute) se țin minte în fiecare tabel. */
  maxIntrari: number;
}

/**
 * Trei bariere, toate în memorie (serverul e un singur proces):
 *  1. pe adresă și login: după 5 eșecuri, o pauză care se dublează la fiecare eșec (până la 15 min);
 *  2. pe login, de la orice adresă: după 20 de eșecuri în 15 minute, cel mult o încercare la 10 s.
 *     Ghicitul din multe adrese devine lent, dar nimeni nu poate bloca adminul mult timp: o adresă
 *     de pe care contul a intrat cu succes în ultimele 30 de zile nu e încetinită;
 *  3. tabelele au o mărime maximă: când se umplu, pleacă întâi intrările expirate, apoi cele mai vechi.
 *     Un val de loginuri inventate nu mai poate șterge blocările existente (înainte se goleau toate).
 */
export class ProtectieLogin {
  static readonly PRAG_ADRESA = 5;
  static readonly PRAG_LOGIN = 20;
  static readonly FEREASTRA_LOGIN = 15 * 60_000;
  static readonly PAUZA_LOGIN = 10_000;
  static readonly PAUZA_MAXIMA = 15 * 60_000;
  static readonly ZILE_ADRESA_CUNOSCUTA = 30;

  /** Cheie `${grup adresă}|${login}` → eșecuri, blocat până la, ultimul eșec. */
  private peAdresa = new Map<string, { nr: number; pana: number; ultima: number }>();
  /** Login → momentele ultimelor eșecuri (cel mult PRAG_LOGIN), următoarea încercare permisă. */
  private peLogin = new Map<string, { momente: number[]; urmatoarea: number; exista: boolean }>();
  /** Cheie `${grup adresă}|${login}` → până când adresa e cunoscută pentru acel cont. */
  private cunoscute = new Map<string, number>();

  constructor(private opt: OptiuniProtectie = { maxIntrari: 10_000 }) {}

  /** Aruncă 429 dacă încercarea trebuie refuzată; altfel o lasă să treacă. */
  verifica(login: string, adresa: string, acum = Date.now()): void {
    const l = login.toLowerCase();
    const grup = grupAdresa(adresa);
    const e = this.peAdresa.get(`${grup}|${l}`);
    if (e && e.pana > acum) {
      throw new EroareUtilizator(`Prea multe încercări; reîncercați în ${Math.ceil((e.pana - acum) / 1000)} s`, 429);
    }
    const pl = this.peLogin.get(l);
    if (!pl || !this.incetinit(pl, acum) || (this.cunoscute.get(`${grup}|${l}`) ?? 0) > acum) return;
    if (acum < pl.urmatoarea) {
      throw new EroareUtilizator(`Prea multe încercări pentru acest cont; reîncercați în ${Math.ceil((pl.urmatoarea - acum) / 1000)} s`, 429);
    }
    pl.urmatoarea = acum + ProtectieLogin.PAUZA_LOGIN;
  }

  esec(login: string, adresa: string, exista: boolean, acum = Date.now()): void {
    const l = login.toLowerCase();
    const cheie = `${grupAdresa(adresa)}|${l}`;
    const e = this.peAdresa.get(cheie) ?? { nr: 0, pana: 0, ultima: 0 };
    e.nr += 1;
    e.ultima = acum;
    if (e.nr >= ProtectieLogin.PRAG_ADRESA) e.pana = acum + Math.min(30_000 * 2 ** (e.nr - ProtectieLogin.PRAG_ADRESA), ProtectieLogin.PAUZA_MAXIMA);
    // Șters și pus la loc: ordinea din Map rămâne „cel mai vechi eșec primul”.
    this.peAdresa.delete(cheie);
    if (this.peAdresa.size >= this.opt.maxIntrari) this.elibereazaAdrese(acum);
    this.peAdresa.set(cheie, e);

    const pl = this.peLogin.get(l) ?? { momente: [], urmatoarea: 0, exista };
    pl.momente.push(acum);
    if (pl.momente.length > ProtectieLogin.PRAG_LOGIN) pl.momente.shift();
    pl.exista = exista;
    this.peLogin.delete(l);
    if (this.peLogin.size >= this.opt.maxIntrari) this.elibereazaLoginuri(acum);
    this.peLogin.set(l, pl);
  }

  reusit(login: string, adresa: string, acum = Date.now()): void {
    const l = login.toLowerCase();
    const cheie = `${grupAdresa(adresa)}|${l}`;
    this.peAdresa.delete(cheie);
    this.cunoscute.delete(cheie);
    if (this.cunoscute.size >= this.opt.maxIntrari) {
      for (const [k, pana] of this.cunoscute) if (pana <= acum) this.cunoscute.delete(k);
      for (const k of this.cunoscute.keys()) {
        if (this.cunoscute.size < this.opt.maxIntrari) break;
        this.cunoscute.delete(k);
      }
    }
    this.cunoscute.set(cheie, acum + ProtectieLogin.ZILE_ADRESA_CUNOSCUTA * 86_400_000);
  }

  /** Câte chei ține minte (pentru teste). */
  marime() {
    return { peAdresa: this.peAdresa.size, peLogin: this.peLogin.size, cunoscute: this.cunoscute.size };
  }

  private incetinit(pl: { momente: number[] }, acum: number) {
    return pl.momente.length >= ProtectieLogin.PRAG_LOGIN && acum - pl.momente[0] < ProtectieLogin.FEREASTRA_LOGIN;
  }

  private elibereazaAdrese(acum: number) {
    for (const [k, v] of this.peAdresa) {
      if (v.pana <= acum && acum - v.ultima > ProtectieLogin.FEREASTRA_LOGIN) this.peAdresa.delete(k);
    }
    // Tot plin: pleacă cele mai vechi (o zecime, ca să nu se repete curățarea la fiecare eșec).
    const tinta = Math.floor(this.opt.maxIntrari * 0.9);
    for (const k of this.peAdresa.keys()) {
      if (this.peAdresa.size <= tinta) break;
      this.peAdresa.delete(k);
    }
  }

  private elibereazaLoginuri(acum: number) {
    for (const [k, v] of this.peLogin) if (!this.incetinit(v, acum) && acum - v.momente[v.momente.length - 1] > ProtectieLogin.FEREASTRA_LOGIN) this.peLogin.delete(k);
    // Conturile reale rămân: pleacă întâi loginurile inexistente, cele mai vechi primele.
    const tinta = Math.floor(this.opt.maxIntrari * 0.9);
    for (const [k, v] of this.peLogin) {
      if (this.peLogin.size <= tinta) break;
      if (!v.exista) this.peLogin.delete(k);
    }
    for (const k of this.peLogin.keys()) {
      if (this.peLogin.size <= tinta) break;
      this.peLogin.delete(k);
    }
  }
}

/**
 * Cel mult `paralele` calcule scrypt odată și `inAsteptare` la coadă; peste atât, 429 imediat.
 * scrypt rulează pe firele libuv (4 implicit), aceleași de care au nevoie DNS-ul (plățile prin
 * POSLink) și citirea fișierelor: un val de loginuri nu trebuie să le ocupe pe toate.
 */
export class LimitatorHash {
  private active = 0;
  private coada: (() => void)[] = [];

  constructor(
    private paralele = 2,
    private inAsteptare = 20,
  ) {}

  async ruleaza<T>(f: () => Promise<T>): Promise<T> {
    if (this.active < this.paralele) this.active++;
    else {
      if (this.coada.length >= this.inAsteptare) {
        throw new EroareUtilizator('Prea multe autentificări în același timp; reîncercați peste câteva secunde', 429);
      }
      // Locul se predă direct de la cel care termină, ca nimeni să nu treacă peste rând.
      await new Promise<void>((rezolva) => this.coada.push(rezolva));
    }
    try {
      return await f();
    } finally {
      const urmatorul = this.coada.shift();
      if (urmatorul) urmatorul();
      else this.active--;
    }
  }
}

/** Login refuzat pentru parolă greșită; `contExista` spune dacă loginul aparține unui cont activ (pentru jurnal). */
export class EroareLogin extends EroareUtilizator {
  constructor(public contExista: boolean) {
    super('Utilizator sau parolă greșită', 401);
  }
}

const protectie = new ProtectieLogin();
const limitatorHash = new LimitatorHash();
const SARE_FALSA = 'sare-pentru-conturi-inexistente';

export async function autentificare(db: Db, login: string, parola: string, adresa = '') {
  protectie.verifica(login, adresa);
  const u = (await db.query<any>('SELECT * FROM utilizatori WHERE login = $1 AND activ', [login]))[0];
  // Pentru un cont inexistent facem totuși un hash, ca durata răspunsului să nu dea de gol loginurile valide.
  const corect = await limitatorHash.ruleaza(async () =>
    u?.parola_hash ? parolaCorecta(parola, u.sare, u.parola_hash) : (await hashParola(parola, SARE_FALSA), false),
  );
  if (!corect) {
    protectie.esec(login, adresa, !!u);
    throw new EroareLogin(!!u);
  }
  if (u.rol !== 'admin') throw new EroareUtilizator('Doar administratorii au acces la panou', 403);
  protectie.reusit(login, adresa);
  // Sesiunile expirate (inclusiv peste durata maximă) se șterg la fiecare autentificare.
  await db.query(`DELETE FROM sesiuni WHERE expira_la < now() OR creata_la < now() - interval '${ZILE_SESIUNE_MAXIM} days'`);
  const token = tokenNou();
  await db.query(`INSERT INTO sesiuni (token, utilizator_id, expira_la) VALUES ($1, $2, now() + interval '${ZILE_SESIUNE} days')`, [
    amprentaToken(token),
    u.id,
  ]);
  return { token, utilizator: { id: u.id, nume: u.nume, rol: u.rol } as UtilizatorAutentificat };
}

export async function utilizatorDinToken(db: Db, token: string): Promise<UtilizatorAutentificat | null> {
  const amprenta = amprentaToken(token);
  const r = await db.query<UtilizatorAutentificat>(
    `SELECT u.id, u.nume, u.rol FROM sesiuni s JOIN utilizatori u ON u.id = s.utilizator_id
      WHERE s.token = $1 AND s.expira_la > now() AND s.creata_la > now() - interval '${ZILE_SESIUNE_MAXIM} days' AND u.activ`,
    [amprenta],
  );
  if (!r[0]) return null;
  // Sesiune glisantă: cât timp panoul e folosit, nu expiră în mijlocul lucrului (dar nu peste durata maximă).
  await db.query(
    `UPDATE sesiuni SET expira_la = LEAST(now() + interval '${ZILE_SESIUNE} days', creata_la + interval '${ZILE_SESIUNE_MAXIM} days')
      WHERE token = $1 AND expira_la < now() + interval '3 days'`,
    [amprenta],
  );
  return r[0];
}

export async function iesire(db: Db, token: string) {
  await db.query('DELETE FROM sesiuni WHERE token = $1', [amprentaToken(token)]);
}

// ---- Bilete pentru fluxul de notificări (SSE) ----
// EventSource nu poate trimite antete, iar tokenul de sesiune nu trebuie să ajungă în URL-uri
// (jurnalele serverului și ale proxy-ului). Un bilet e scurt, aleator, valabil un minut și se poate
// folosi o singură dată (panoul cere altul la fiecare reconectare). Biletul ține minte amprenta
// tokenului din care a fost cerut, ca fluxul deschis să poată fi reverificat (vezi detinatorValid).

export interface DetinatorFlux {
  utilizator?: UtilizatorAutentificat;
  dispozitiv?: DispozitivAutentificat;
  /** Amprenta tokenului de sesiune sau al tabletei. */
  amprenta: string;
}
interface Bilet extends DetinatorFlux {
  expira: number;
}
const bilete = new Map<string, Bilet>();
/** Biletele încă nefolosite ale fiecărui deținător, în ordinea emiterii. */
const biletePeDetinator = new Map<string, string[]>();
/** Câte bilete nefolosite poate avea un deținător; la al șaselea, cel mai vechi nu mai e valabil. */
export const MAX_BILETE_PE_DETINATOR = 5;
const VALABILITATE_BILET = 60_000;
let ultimaCuratare = 0;

/** Cheia deținătorului: același admin sau aceeași tabletă, indiferent de sesiune. */
export const cheieDetinator = (d: { utilizator?: { id: number }; dispozitiv?: { id: number } }) =>
  d.utilizator ? `u${d.utilizator.id}` : `d${d.dispozitiv!.id}`;

function scoateDinLista(cheie: string, bilet: string) {
  const lista = biletePeDetinator.get(cheie);
  if (!lista) return;
  const rest = lista.filter((b) => b !== bilet);
  if (rest.length) biletePeDetinator.set(cheie, rest);
  else biletePeDetinator.delete(cheie);
}

export function creeazaBilet(detinator: { utilizator?: UtilizatorAutentificat; dispozitiv?: DispozitivAutentificat }, token: string): string {
  const acum = Date.now();
  // Biletele expirate pleacă cel mult o dată la 10 s, nu la fiecare cerere (harta are cel mult
  // MAX_BILETE_PE_DETINATOR bilete pentru fiecare admin sau tabletă).
  if (acum - ultimaCuratare >= 10_000) {
    ultimaCuratare = acum;
    for (const [b, v] of bilete) {
      if (v.expira >= acum) continue;
      bilete.delete(b);
      scoateDinLista(cheieDetinator(v), b);
    }
  }
  const cheie = cheieDetinator(detinator);
  const lista = (biletePeDetinator.get(cheie) ?? []).filter((b) => bilete.has(b));
  while (lista.length >= MAX_BILETE_PE_DETINATOR) bilete.delete(lista.shift()!);
  const bilet = tokenNou();
  bilete.set(bilet, { ...detinator, amprenta: amprentaToken(token), expira: acum + VALABILITATE_BILET });
  lista.push(bilet);
  biletePeDetinator.set(cheie, lista);
  return bilet;
}

/** Deținătorul biletului, o singură dată: biletul nu mai e valabil după această citire. */
export function detinatorBilet(bilet: string): DetinatorFlux | null {
  const b = bilete.get(bilet);
  if (!b) return null;
  bilete.delete(bilet);
  scoateDinLista(cheieDetinator(b), bilet);
  if (b.expira < Date.now()) return null;
  const { expira: _expira, ...detinator } = b;
  return detinator;
}

/**
 * Fluxul deschis e încă al cuiva cu drept la el? Sesiunea adminului există, nu a expirat și contul e tot
 * admin activ; tableta are încă același token (nu a fost dezactivată sau reasociată) și aceeași locație.
 * Fără prelungirea sesiunii: doar o cerere a panoului o prelungește.
 */
export async function detinatorValid(db: Db, d: DetinatorFlux): Promise<boolean> {
  if (d.utilizator) {
    const r = await db.query(
      `SELECT 1 FROM sesiuni s JOIN utilizatori u ON u.id = s.utilizator_id
        WHERE s.token = $1 AND s.utilizator_id = $2 AND s.expira_la > now()
          AND s.creata_la > now() - interval '${ZILE_SESIUNE_MAXIM} days' AND u.activ AND u.rol = 'admin'`,
      [d.amprenta, d.utilizator.id],
    );
    return r.length > 0;
  }
  if (!d.dispozitiv) return false;
  const r = await db.query('SELECT 1 FROM dispozitive WHERE id = $1 AND token = $2 AND activ AND locatie_id = $3', [d.dispozitiv.id, d.amprenta, d.dispozitiv.locatie_id]);
  return r.length > 0;
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
    [amprentaToken(token)],
  );
  return r[0] ?? null;
}

/** Cât e valabil un cod de asociere de la emitere (ore). Apoi adminul cere altul („Reasociază”). */
export const VALABILITATE_COD_ORE = 24;

/** Adminul creează tableta și primește un cod de asociere de 8 caractere, valabil o singură dată. */
export async function creeazaDispozitiv(db: Db, nume: string, locatieId: number) {
  const r = await db.query('INSERT INTO dispozitive (nume, locatie_id, cod_asociere, cod_asociere_la) VALUES ($1, $2, $3, now()) RETURNING *', [nume, locatieId, codAsociere()]);
  return r[0];
}

/**
 * Asocierea cu un cod: pauze pe adresă după încercări greșite (aceleași bariere ca la login, cheia
 * „asociere”), iar codul e valabil VALABILITATE_COD_ORE de la emitere. Eșecurile se numără în jurnal
 * (rânduri `asociere.esuata` adunate pe adresă, rute/pos.ts).
 */
const protectieAsociere = new ProtectieLogin();

export async function asociazaDispozitiv(db: Db, cod: string, adresa = '') {
  protectieAsociere.verifica('asociere', adresa);
  const token = tokenNou();
  const r = await db.query<any>(
    `UPDATE dispozitive SET token = $2, cod_asociere = NULL, cod_asociere_la = NULL
      WHERE cod_asociere = $1 AND activ AND cod_asociere_la > now() - interval '${VALABILITATE_COD_ORE} hours'
     RETURNING id, nume, locatie_id`,
    [cod.trim().toUpperCase(), amprentaToken(token)],
  );
  if (!r[0]) {
    protectieAsociere.esec('asociere', adresa, true);
    throw new EroareUtilizator(`Cod de asociere greșit, expirat (după ${VALABILITATE_COD_ORE} de ore) sau deja folosit; cereți în panou un cod nou`, 401);
  }
  protectieAsociere.reusit('asociere', adresa);
  return { token, dispozitiv: r[0] as DispozitivAutentificat };
}

/** Generează un cod nou (de ex. tableta a fost resetată); tokenul vechi nu mai funcționează. */
export async function reasociazaDispozitiv(db: Db, id: number) {
  const r = await db.query('UPDATE dispozitive SET cod_asociere = $2, cod_asociere_la = now(), token = NULL WHERE id = $1 RETURNING *', [id, codAsociere()]);
  if (!r[0]) throw new EroareNegasit('Tableta');
  return r[0];
}

export function listaDispozitive(db: Db) {
  return db.query(
    `SELECT d.id, d.nume, d.locatie_id, l.nume AS locatie, d.cod_asociere, d.activ, d.creat_la, d.ultima_sincronizare,
            d.terminal_device_id, d.token IS NOT NULL AS asociat,
            (d.cod_asociere IS NOT NULL AND (d.cod_asociere_la IS NULL OR d.cod_asociere_la <= now() - interval '${VALABILITATE_COD_ORE} hours')) AS cod_expirat
       FROM dispozitive d JOIN locatii l ON l.id = d.locatie_id ORDER BY l.nume, d.nume`,
  );
}

/**
 * Dezactivarea șterge tokenul tabletei: e o revocare reală, nu doar o bifă. Reactivarea nu readuce
 * tokenul vechi (care poate fi fost copiat de pe o tabletă pierdută), ci dă un cod nou de asociere.
 * Vânzările netrimise de pe tabletă rămân în ea și pleacă după re-asociere.
 */
export async function activeazaDispozitiv(db: Db, id: number, activ: boolean): Promise<{ cod_asociere: string | null }> {
  const r = await db.query<{ cod_asociere: string | null }>(
    `UPDATE dispozitive SET activ = $2, token = NULL, cod_asociere = $3, cod_asociere_la = CASE WHEN $2 THEN now() END
      WHERE id = $1 AND activ <> $2 RETURNING cod_asociere`,
    [id, activ, activ ? codAsociere() : null],
  );
  if (r[0]) return r[0];
  // Era deja în starea cerută: nu se schimbă nimic (o tabletă activă nu-și pierde tokenul).
  const existenta = await db.query<{ cod_asociere: string | null }>('SELECT cod_asociere FROM dispozitive WHERE id = $1', [id]);
  if (!existenta[0]) throw new EroareNegasit('Tableta');
  return existenta[0];
}

/**
 * Utilizatorul pe care îl poate declara o tabletă: are PIN și lucrează în locația ei (sau în
 * toate), exact regula după care catalogul îi trimite tabletei lista. Un utilizator dezactivat
 * între timp rămâne valabil, ca vânzările făcute offline înainte de dezactivare să se aplice.
 *
 * Un administrator nu are PIN (rolul de admin îl șterge: salveazaUtilizator, migrarea 004), deci nu
 * apare pe tablete. Se acceptă doar operațiile lui offline cu `moment` anterior (vezi limitaAdmin):
 *  - ultimei promovări barista → admin din jurnalul de audit (o barista promovată, cu coada încă în tabletă);
 *  - actualizării care a șters PIN-urile adminilor (migrarea 004), pe o instalare de dinaintea ei: până
 *    atunci un admin cu PIN vindea pe tabletă, iar coada de atunci trebuie să se poată aplica.
 * Altfel (sau fără `moment`, la cererile online) e eroarea „nu are PIN”, iar adminul decide prin „Reaplică”.
 *
 * `limite` ține minte, pe durata unui lot de sincronizare, limita fiecărui admin: un lot de sute de
 * evenimente pe numele aceluiași admin citește jurnalul o singură dată.
 */
export async function utilizatorPermisTabletei(db: Db, utilizatorId: number, locatieId: number, moment?: string, limite?: LimiteAdmin): Promise<void> {
  const u = (
    await db.query<{ nume: string; rol: string; are_pin: boolean; locatie_id: number | null }>(
      'SELECT nume, rol, pin_hash IS NOT NULL AS are_pin, locatie_id FROM utilizatori WHERE id = $1',
      [utilizatorId],
    )
  )[0];
  if (!u) throw new EroareUtilizator(`Utilizatorul ${utilizatorId} nu există`);
  if (u.locatie_id != null && u.locatie_id !== locatieId) throw new EroareUtilizator(`Utilizatorul ${u.nume} nu lucrează în această locație`);
  if (u.are_pin) return;
  if (u.rol !== 'admin') throw new EroareUtilizator(`Utilizatorul ${u.nume} nu are PIN de tabletă; dați-i un PIN în Setări → Utilizatori, apoi „Reaplică”`);
  if (moment) {
    let limita = limite?.get(utilizatorId);
    if (limita === undefined) {
      limita = await limitaAdmin(db, utilizatorId);
      limite?.set(utilizatorId, limita);
    }
    if (limita != null && Date.parse(moment) < limita) return;
  }
  // Un administrator nu poate primi PIN (salveazaUtilizator i-l șterge): calea e retrogradarea temporară.
  throw new EroareUtilizator(
    `Utilizatorul ${u.nume} e administrator, fără PIN de tabletă. Ca operațiunea să se aplice: treceți-l temporar la barista ` +
      'cu un PIN (Setări → Utilizatori), apăsați „Reaplică”, apoi readuceți-l la administrator',
  );
}

/** Limitele adminilor pe durata unui lot: id → moment (ms) înaintea căruia operațiile lui se acceptă, null = niciunul. */
export type LimiteAdmin = Map<number, number | null>;

const MIGRARE_FARA_PIN_ADMIN = '004_securitate_registre_jurnal.sql';

/**
 * Momentul înaintea căruia operațiile unui admin fără PIN se acceptă: cea mai recentă dintre ultima lui
 * promovare barista → admin (jurnalul de audit, indexul parțial jurnal_audit_promovari) și aplicarea
 * migrării 004, dar aceasta doar pe o instalare mai veche decât ea. La o instalare nouă toate migrațiile
 * se aplică odată, deci nu exista nicio coadă de dinainte; o oră între prima migrație și 004 deosebește
 * o actualizare de o instalare nouă.
 */
async function limitaAdmin(db: Db, utilizatorId: number): Promise<number | null> {
  const [r] = await db.query<{ promovat: string | Date | null; migrare: string | Date | null }>(
    `SELECT (SELECT MAX(la) FROM jurnal_audit
              WHERE actiune = 'PUT /api/utilizatori/:id' AND cale = $1 AND stare_http = 200
                AND date->'inainte'->>'rol' = 'barista' AND date->'corp'->>'rol' = 'admin') AS promovat,
            (SELECT m.aplicata_la FROM schema_migrari m
              WHERE m.nume = $2 AND m.aplicata_la > (SELECT MIN(aplicata_la) FROM schema_migrari) + interval '1 hour') AS migrare`,
    [`/api/utilizatori/${utilizatorId}`, MIGRARE_FARA_PIN_ADMIN],
  );
  const momente = [r?.promovat, r?.migrare].filter((x): x is string | Date => x != null).map((x) => new Date(x).getTime());
  return momente.length ? Math.max(...momente) : null;
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
  // Administratorii lucrează în panou, nu pe tablete: nu au PIN, deci nu ajung în catalogul tabletelor.
  if (d.rol === 'admin') d = { ...d, pin: null };
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
              parola_hash = COALESCE($7, parola_hash),
              pin_hash = CASE WHEN $3 = 'admin' THEN NULL ELSE COALESCE($8, pin_hash) END
        WHERE id = $1`,
      [id, d.nume, d.rol, d.login || null, d.locatie_id ?? null, d.activ ?? true, parolaHash, pinHash],
    );
    // Parola schimbată, cont dezactivat sau retrogradat: sesiunile vechi nu mai sunt valabile.
    if (d.activ === false || d.rol !== 'admin') await db.query('DELETE FROM sesiuni WHERE utilizator_id = $1', [id]);
    else if (parolaHash) {
      await db.query('DELETE FROM sesiuni WHERE utilizator_id = $1 AND token IS DISTINCT FROM $2', [id, sesiuneCurenta ? amprentaToken(sesiuneCurenta) : null]);
    }
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
