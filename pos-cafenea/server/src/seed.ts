// npm run seed [-- zile]  → rețea demonstrativă cu istoric (implicit 120 de zile).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deschideDb } from './db';
import { populeazaDemo } from './demo';
import { salveazaUtilizator } from './servicii/acces';

const radacina = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const zile = Number(process.argv[2] ?? 120);

const db = await deschideDb({
  url: process.env.DATABASE_URL,
  director: process.env.DATABASE_URL ? undefined : (process.env.DIR_DATE ?? path.join(radacina, 'date', 'pglite')),
});

if ((await db.query('SELECT 1 FROM locatii LIMIT 1')).length) {
  console.error('Baza de date are deja locații; demo-ul se încarcă doar într-o bază goală (ștergeți directorul date/).');
  process.exit(1);
}
if (!(await db.query(`SELECT 1 FROM utilizatori WHERE rol = 'admin'`)).length) {
  await salveazaUtilizator(db, { nume: 'Administrator', rol: 'admin', login: 'admin', parola: process.env.ADMIN_PAROLA ?? 'schimba-ma' });
}

const inceput = Date.now();
const r = await populeazaDemo(db, { zileIstoric: zile });
const n = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM comenzi');
console.log(`Demo încărcat în ${Math.round((Date.now() - inceput) / 1000)} s: ${n[0].n} comenzi pe ${zile} zile.`);
console.log(`Panou: login admin / ${process.env.ADMIN_PAROLA ? '(ADMIN_PAROLA)' : 'schimba-ma'}`);
console.log(`Coduri de asociere tablete: Centru ${r.coduri_tablete.centru}, Botanica ${r.coduri_tablete.botanica}`);
for (const b of r.baristi) console.log(`Barista ${b.nume} (${b.locatie}): PIN ${b.pin}`);
await db.close();
