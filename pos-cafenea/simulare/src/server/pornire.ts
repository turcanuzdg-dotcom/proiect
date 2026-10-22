// Pornește serverul real (rutele și serviciile din server/src) în browser, pe PGlite, cu rețeaua
// demo încărcată dintr-o arhivă. Tot ce face simularea trece prin același cod ca în producție;
// doar terminalul PAX și rețeaua sunt înlocuite.
import { PGlite, types } from '@electric-sql/pglite';
import urlWasm from 'pglite-dist/pglite.wasm?url';
import urlFs from 'pglite-dist/pglite.data?url';
import { dinPglite, type Db } from '../../../server/src/db-comun';
import { magistrala, type Notificare } from '../../../server/src/magistrala';
import { ruteAdmin } from '../../../server/src/rute/admin';
import { rutePOS } from '../../../server/src/rute/pos';
import * as acces from '../../../server/src/servicii/acces';
import { ClientPOSLink } from '../../../server/src/servicii/poslink';
import { citesteSetare, scrieSetare } from '../../../server/src/servicii/setari';
import { folosesteClientPOSLink } from '../../../server/src/servicii/terminal';
import { CHEIE_SIMULARE } from '../constante';
import { RuterSim, type CerereSim, type RaspunsSim } from './ruter';
import { TerminalSimulat } from './terminal-simulat';

export interface TabletaSim {
  token: string;
  dispozitiv: { id: number; nume: string; locatie_id: number };
}

export interface ServerSim {
  db: Db;
  ruter: RuterSim;
  terminal: TerminalSimulat;
  tokenAdmin: string;
  centru: TabletaSim;
  botanica: TabletaSim;
  /** Fluxul de notificări (SSE) pentru un bilet; întoarce funcția de oprire sau null dacă biletul nu e valid. */
  flux(bilet: string, laMesaj: (date: string) => void): (() => void) | null;
}

export interface Progres {
  faza: string;
  procent: number;
}

async function descarca(url: string, laOcteti: (n: number, total: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`Nu s-a putut descărca ${url} (${r.status})`);
  const total = Number(r.headers.get('content-length')) || 0;
  const bucati: Uint8Array[] = [];
  let primiti = 0;
  const cititor = r.body.getReader();
  for (;;) {
    const { done, value } = await cititor.read();
    if (done) break;
    bucati.push(value);
    primiti += value.length;
    laOcteti(primiti, total);
  }
  const tot = new Uint8Array(primiti);
  let poz = 0;
  for (const b of bucati) {
    tot.set(b, poz);
    poz += b.length;
  }
  return tot;
}

const ziLocala = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau' }).format(d);

/** Mută tot istoricul cu un număr întreg de zile, ca ultima zi din arhivă să devină ieri. */
async function aduceIstoriculLaZi(db: Db) {
  const { generat_pentru } = await citesteSetare(db, CHEIE_SIMULARE, { generat_pentru: '' });
  if (!generat_pentru) return;
  const azi = ziLocala(new Date());
  const zile = Math.round((Date.parse(azi) - Date.parse(generat_pentru)) / 86_400_000);
  if (!zile) return;
  const coloane = await db.query<{ tabel: string; coloana: string }>(
    `SELECT c.table_name AS tabel, c.column_name AS coloana
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.table_name <> 'schema_migrari'
        AND c.data_type IN ('timestamp with time zone', 'timestamp without time zone', 'date')`,
  );
  const peTabele = new Map<string, string[]>();
  for (const c of coloane) peTabele.set(c.tabel, [...(peTabele.get(c.tabel) ?? []), c.coloana]);
  await db.tx(async (t) => {
    // Zilele se adună în ora Chișinăului, ca orele din istoric să rămână aceleași și peste schimbarea orei.
    await t.exec(`SET LOCAL TimeZone = 'Europe/Chisinau'`);
    for (const [tabel, cols] of peTabele) {
      await t.query(`UPDATE ${tabel} SET ${cols.map((c) => `${c} = ${c} + $1::interval`).join(', ')}`, [`${zile} days`]);
    }
  });
  await scrieSetare(db, CHEIE_SIMULARE, { generat_pentru: azi });
}

async function asociaza(db: Db, nume: string): Promise<TabletaSim> {
  const [d] = await db.query<{ id: number }>('SELECT id FROM dispozitive WHERE nume = $1', [nume]);
  const { cod_asociere } = await acces.reasociazaDispozitiv(db, d.id);
  return acces.asociazaDispozitiv(db, cod_asociere);
}

export async function pornesteServer(laProgres: (p: Progres) => void): Promise<ServerSim> {
  // Cele trei fișiere mari se descarcă în paralel; progresul e suma lor.
  const surse = [urlWasm, urlFs, 'date-demo.tar.gz'];
  const primiti = surse.map(() => 0);
  const totaluri = surse.map(() => 0);
  const raporteaza = () => {
    const total = totaluri.reduce((s, x) => s + x, 0);
    const p = total ? primiti.reduce((s, x) => s + x, 0) / total : 0;
    laProgres({ faza: `Se descarcă programul și datele (${(primiti.reduce((s, x) => s + x, 0) / 1e6).toFixed(1)} MB)`, procent: Math.min(0.85, p * 0.85) });
  };
  const [wasm, fs, arhiva] = await Promise.all(
    surse.map((u, i) =>
      descarca(u, (n, t) => {
        primiti[i] = n;
        totaluri[i] = t || n;
        raporteaza();
      }),
    ),
  );

  laProgres({ faza: 'Pornește baza de date (PostgreSQL în browser)', procent: 0.88 });
  const wasmModule = await WebAssembly.compile(wasm);
  const lite = await PGlite.create({
    wasmModule,
    fsBundle: new Blob([fs]),
    loadDataDir: new Blob([arhiva], { type: 'application/x-gzip' }),
    parsers: { [types.NUMERIC]: parseFloat, [types.INT8]: Number },
  });
  const db = dinPglite(lite);

  laProgres({ faza: 'Pregătește rețeaua de cafenele', procent: 0.94 });
  await aduceIstoriculLaZi(db);
  // Parola panoului rămâne „schimba-ma”; hash-ul se reface cu înlocuitorul de scrypt din browser.
  for (const u of await db.query<{ id: number; sare: string }>(`SELECT id, sare FROM utilizatori WHERE login = 'admin'`)) {
    await db.query('UPDATE utilizatori SET parola_hash = $2 WHERE id = $1', [u.id, await acces.hashParola('schimba-ma', u.sare)]);
  }
  const { token: tokenAdmin } = await acces.autentificare(db, 'admin', 'schimba-ma');
  const centru = await asociaza(db, 'Tabletă Centru');
  const botanica = await asociaza(db, 'Tabletă Botanica');

  const terminal = new TerminalSimulat();
  folosesteClientPOSLink(new ClientPOSLink({ url: 'https://poslink.simulare/POSLink', cheie: 'simulare' }, terminal.fetch));

  // Aceleași reguli de acces ca în server/src/app.ts.
  const tokenDin = (req: CerereSim) => {
    const h = req.headers.authorization;
    return h?.startsWith('Bearer ') ? h.slice(7) : null;
  };
  const doarAdmin = async (req: CerereSim, reply: RaspunsSim) => {
    const token = tokenDin(req);
    const u = token ? await acces.utilizatorDinToken(db, token) : null;
    if (!u || u.rol !== 'admin') return reply.status(401).send({ eroare: 'Autentificare necesară' });
    req.utilizator = u;
  };
  const doarDispozitiv = async (req: CerereSim, reply: RaspunsSim) => {
    const token = tokenDin(req);
    const d = token ? await acces.dispozitivDinToken(db, token) : null;
    if (!d) return reply.status(401).send({ eroare: 'Tableta nu este asociată sau a fost dezactivată' });
    req.dispozitiv = d;
  };

  const ruter = new RuterSim();
  const app = ruter.instanta();
  app.get('/api/sanatate', async () => ({ ok: true, ora: new Date().toISOString() }));
  app.post('/api/flux/bilet', async (req: any, reply: any) => {
    const token = tokenDin(req);
    const u = token ? await acces.utilizatorDinToken(db, token) : null;
    const d = !u && token ? await acces.dispozitivDinToken(db, token) : null;
    if (!u && !d) return reply.status(401).send({ eroare: 'Autentificare necesară' });
    return { bilet: acces.creeazaBilet(u ? { utilizator: u } : { dispozitiv: d! }) };
  });
  await app.register(async (pos) => rutePOS(pos, db, doarDispozitiv as any));
  await app.register(async (adm) => ruteAdmin(adm, db, doarAdmin as any));
  await ruter.gata();

  const flux = (bilet: string, laMesaj: (date: string) => void) => {
    const detinator = acces.detinatorBilet(bilet);
    if (!detinator) return null;
    const d = detinator.dispozitiv ?? null;
    const asculta = (n: Notificare) => {
      if (d && n.locatie_id != null && n.locatie_id !== d.locatie_id) return;
      laMesaj(JSON.stringify(n));
    };
    magistrala.on('notificare', asculta);
    return () => void magistrala.off('notificare', asculta);
  };

  laProgres({ faza: 'Gata', procent: 1 });
  return { db, ruter, terminal, tokenAdmin, centru, botanica, flux };
}
