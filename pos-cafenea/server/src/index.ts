import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { construiesteApp } from './app';
import { deschideDb } from './db';
import { salveazaUtilizator } from './servicii/acces';

const radacina = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.env.PORT ?? 3000);

const db = await deschideDb({
  url: process.env.DATABASE_URL,
  director: process.env.DATABASE_URL ? undefined : (process.env.DIR_DATE ?? path.join(radacina, 'date', 'pglite')),
});

// La prima pornire nu există niciun cont: se creează administratorul din variabilele de mediu.
const admini = await db.query(`SELECT 1 FROM utilizatori WHERE rol = 'admin' LIMIT 1`);
if (!admini.length) {
  const parola = process.env.ADMIN_PAROLA ?? 'schimba-ma';
  await salveazaUtilizator(db, { nume: 'Administrator', rol: 'admin', login: process.env.ADMIN_LOGIN ?? 'admin', parola });
  console.warn(`Cont de administrator creat: ${process.env.ADMIN_LOGIN ?? 'admin'} / ${process.env.ADMIN_PAROLA ? '(din ADMIN_PAROLA)' : parola} — schimbați parola.`);
}

const app = await construiesteApp({ db, dirWeb: path.join(radacina, 'web', 'dist'), jurnal: process.env.JURNAL !== '0' });
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });

for (const semnal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(semnal, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
}
