// Pregătește datele simulării: rețeaua demo cu istoric, salvată ca arhivă PGlite pe care browserul
// o încarcă la pornire. Rulare: npx tsx simulare/genereaza-date.ts [zile]
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { deschideDb } from '../server/src/db';
import { populeazaDemo } from '../server/src/demo';
import { salveazaUtilizator } from '../server/src/servicii/acces';
import { scrieSetare } from '../server/src/servicii/setari';
import { CHEIE_SIMULARE, TERMINAL_SIMULAT } from './src/constante';

const aici = path.dirname(fileURLToPath(import.meta.url));
const zile = Number(process.argv[2] ?? 120);
const director = await mkdtemp(path.join(os.tmpdir(), 'simulare-'));

const db = await deschideDb({ director });
await salveazaUtilizator(db, { nume: 'Administrator', rol: 'admin', login: 'admin', parola: 'schimba-ma' });
const inceput = Date.now();
await populeazaDemo(db, { zileIstoric: zile });
// Tableta din Centru are terminalul PAX (simulat): plata cu cardul și bonurile trec prin el.
await db.query(`UPDATE dispozitive SET terminal_device_id = $1 WHERE nume = 'Tabletă Centru'`, [TERMINAL_SIMULAT]);
await scrieSetare(db, 'fiscal', { cota_tva_implicita: 'A', antet: 'Cafenea Centru · Vă mulțumim!' });
// Browserul mută tot istoricul cu atâtea zile câte au trecut de la această dată, ca „azi” să fie mereu azi.
const azi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau' }).format(new Date());
await scrieSetare(db, CHEIE_SIMULARE, { generat_pentru: azi });
await db.close();

const lite = new PGlite({ dataDir: director });
await lite.waitReady;
await lite.exec('VACUUM FULL ANALYZE');
await lite.exec('CHECKPOINT');
// Din jurnalul WAL (1 MB pe segment) trebuie doar segmentele de la ultimul checkpoint încoace;
// celelalte sunt reciclate sau vechi și ar dubla arhiva pe care o descarcă browserul.
const [wal] = (
  await lite.query<{ prima: string; ultima: string }>(
    'SELECT redo_wal_file AS prima, pg_walfile_name(pg_current_wal_insert_lsn()) AS ultima FROM pg_control_checkpoint()',
  )
).rows;
const tar = new Uint8Array(await (await lite.dumpDataDir('none')).arrayBuffer());
await lite.close();
const pastrat = filtreazaTar(tar, (nume) => {
  const m = /pg_wal\/([0-9A-F]{24})$/.exec(nume);
  return !m || (m[1] >= wal.prima && m[1] <= wal.ultima);
});
const arhiva = gzipSync(pastrat, { level: 9 });
const tinta = path.join(aici, 'public', 'date-demo.tar.gz');
await writeFile(tinta, arhiva);
await rm(director, { recursive: true, force: true });

// Verificare: arhiva pornește și are istoricul.
const proba = await PGlite.create({ loadDataDir: new Blob([arhiva]) });
const [{ n }] = (await proba.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM comenzi')).rows;
await proba.close();
console.log(`Date simulare: ${zile} zile, ${n} comenzi, în ${Math.round((Date.now() - inceput) / 1000)} s; ${(arhiva.length / 1e6).toFixed(1)} MB → ${path.relative(process.cwd(), tinta)}`);

/** Copia unei arhive tar fără intrările respinse de `pastreaza` (cu tot cu antetele pax ale lor). */
function filtreazaTar(tar: Uint8Array, pastreaza: (nume: string) => boolean): Uint8Array {
  const text = (de: number, lungime: number) => new TextDecoder().decode(tar.subarray(de, de + lungime)).replace(/\0.*$/s, '');
  const bucati: Uint8Array[] = [];
  let pax: Uint8Array | null = null;
  for (let poz = 0; poz + 512 <= tar.length; ) {
    if (tar.subarray(poz, poz + 512).every((b) => b === 0)) break;
    const marime = parseInt(text(poz + 124, 12).trim() || '0', 8);
    const sfarsit = poz + 512 + Math.ceil(marime / 512) * 512;
    const intrare = tar.subarray(poz, sfarsit);
    const tip = String.fromCharCode(tar[poz + 156]);
    if (tip === 'x') {
      pax = intrare;
    } else {
      const prefix = text(poz + 345, 155);
      const nume = (prefix ? `${prefix}/` : '') + text(poz, 100);
      if (pastreaza(nume)) bucati.push(...(pax ? [pax] : []), intrare);
      pax = null;
    }
    poz = sfarsit;
  }
  bucati.push(new Uint8Array(1024));
  const rez = new Uint8Array(bucati.reduce((s, b) => s + b.length, 0));
  let poz = 0;
  for (const b of bucati) {
    rez.set(b, poz);
    poz += b.length;
  }
  return rez;
}

