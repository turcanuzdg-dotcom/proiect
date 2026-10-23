import { randomUUID } from 'node:crypto';
import { totalComanda, type CatalogPOS, type EvenimentPOS, type LinieComanda, type MetodaPlata, type MotivCasare } from '@cafenea/shared';
import { construiesteApp } from '../src/app';
import { deschideDb } from '../src/db';
import { populeazaDemo } from '../src/demo';
import { salveazaUtilizator } from '../src/servicii/acces';

/**
 * Implicit testele rulează pe PGlite în memorie. Cu TEST_DATABASE_URL=postgres://.../postgres
 * fiecare fișier de teste primește o bază nouă pe serverul PostgreSQL indicat.
 */
export async function bazaDeTest() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return deschideDb();
  const nume = `test_${randomUUID().replace(/-/g, '')}`;
  const pg = (await import('pg')).default;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${nume}`);
  await admin.end();
  const u = new URL(url);
  u.pathname = `/${nume}`;
  return deschideDb({ url: u.toString() });
}

/** Parola adminului de test: cel puțin 12 caractere, cât cere panoul pentru administratori. */
export const PAROLA_ADMIN = 'parola-test-admin';

/**
 * Testele folosesc momente fixe din octombrie 2026, iar serverul respinge operațiunile datate cu mai
 * mult de o zi înaintea asocierii tabletei: tabletele de test „există” de la începutul lunii.
 */
export async function tableteVechi(db: { query: (sql: string) => Promise<unknown> }) {
  await db.query(`UPDATE dispozitive SET creat_la = LEAST(creat_la, '2026-10-01T00:00:00Z')`);
}

export async function pregateste(opt: { zileIstoric?: number } = {}) {
  const db = await bazaDeTest();
  await salveazaUtilizator(db, { nume: 'Admin', rol: 'admin', login: 'admin', parola: PAROLA_ADMIN });
  const demo = await populeazaDemo(db, { zileIstoric: opt.zileIstoric ?? 0 });
  await tableteVechi(db);
  const app = await construiesteApp({ db });

  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', parola: PAROLA_ADMIN } });
  const tokenAdmin = login.json().token as string;
  const asociere = await app.inject({ method: 'POST', url: '/api/pos/asociere', payload: { cod: demo.coduri_tablete.centru } });
  const tokenTableta = asociere.json().token as string;

  const cerere = async (token: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => {
    const r = await app.inject({ method, url, payload: payload as any, headers: { authorization: `Bearer ${token}` } });
    if (r.statusCode >= 400) throw new Error(`${method} ${url} → ${r.statusCode}: ${r.body}`);
    return r.json();
  };
  const admin = {
    get: (url: string) => cerere(tokenAdmin, 'GET', url),
    post: (url: string, p?: unknown) => cerere(tokenAdmin, 'POST', url, p ?? {}),
    put: (url: string, p?: unknown) => cerere(tokenAdmin, 'PUT', url, p ?? {}),
  };
  const tableta = {
    get: (url: string) => cerere(tokenTableta, 'GET', url),
    post: (url: string, p?: unknown) => cerere(tokenTableta, 'POST', url, p ?? {}),
    put: (url: string, p?: unknown) => cerere(tokenTableta, 'PUT', url, p ?? {}),
    sync: (evenimente: unknown[]) => cerere(tokenTableta, 'POST', '/api/pos/sync', { evenimente }),
  };
  const catalog: CatalogPOS = await tableta.get('/api/pos/catalog');
  const articole: { id: number; nume: string }[] = await admin.get('/api/articole');
  const idArticol = (nume: string) => articole.find((a) => a.nume === nume)!.id;
  const produs = (nume: string) => catalog.produse.find((p) => p.nume === nume)!;
  const modificator = (nume: string) => catalog.modificatori.find((m) => m.nume === nume)!;
  const barista = catalog.baristi.find((b) => b.nume === 'Ana Rusu')!.id;

  const stoc = async (locatieId: number, nume: string) => {
    const r: { articol_id: number; stoc: number }[] = await admin.get(`/api/stoc?locatie_id=${locatieId}`);
    return r.find((x) => x.articol_id === idArticol(nume))!.stoc;
  };

  return { db, app, demo, admin, tableta, catalog, idArticol, produs, modificator, barista, stoc, tokenAdmin, tokenTableta };
}

let ceas = Date.parse('2026-10-20T06:00:00Z');
/** Momente succesive, ca ordinea evenimentelor să fie clară. */
export const moment = () => new Date((ceas += 60_000)).toISOString();

export function evTuraDeschisa(turaId: string, utilizator: number, fond = 500, la = moment()): EvenimentPOS {
  return { id: randomUUID(), tip: 'tura_deschisa', la, date: { tura_id: turaId, utilizator_id: utilizator, fond_initial: fond } };
}

export function evComanda(
  turaId: string,
  utilizator: number,
  linii: LinieComanda[],
  metoda: MetodaPlata,
  extra: { primit?: number; motiv_casare?: MotivCasare; la?: string } = {},
): EvenimentPOS & { tip: 'comanda' } {
  return {
    id: randomUUID(),
    tip: 'comanda',
    la: extra.la ?? moment(),
    date: {
      comanda_id: randomUUID(), tura_id: turaId, utilizator_id: utilizator, nr: 1, metoda, linii,
      total: totalComanda(linii), primit: extra.primit ?? null, motiv_casare: extra.motiv_casare ?? null,
    },
  };
}
