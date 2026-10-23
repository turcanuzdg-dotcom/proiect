import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { construiesteApp } from './app';
import { deschideDb } from './db';
import { salveazaUtilizator } from './servicii/acces';
import { inchideSolduri } from './servicii/solduri';
import { configPOSLink } from './servicii/poslink';

const radacina = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.env.PORT || 3000);
// În producție (Environment=NODE_ENV=production chiar în unitatea systemd, nu în fișierul cu variabile,
// ca un fișier lipsă să nu poată scoate și protecția) nu există valori implicite de dezvoltare.
const productie = process.env.NODE_ENV === 'production';

if (productie && !process.env.DATABASE_URL) {
  console.error(
    'NODE_ENV=production fără DATABASE_URL: serverul nu pornește pe baza locală de dezvoltare (PGlite). ' +
      'Verificați fișierul cu variabilele de mediu al serviciului.',
  );
  process.exit(1);
}

// O adresă POSLink necriptată ar trimite cheia API și aprobările plăților în clar: serverul nu pornește.
try {
  configPOSLink();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

const db = await deschideDb({
  url: process.env.DATABASE_URL || undefined,
  urlMigrari: process.env.DATABASE_URL_MIGRARI || undefined,
  director: process.env.DATABASE_URL ? undefined : (process.env.DIR_DATE || path.join(radacina, 'date', 'pglite')),
});

// La prima pornire nu există niciun cont: se creează administratorul din variabilele de mediu.
const admini = await db.query(`SELECT 1 FROM utilizatori WHERE rol = 'admin' LIMIT 1`);
if (!admini.length) {
  if ((productie || process.env.DATABASE_URL) && !process.env.ADMIN_PAROLA) {
    console.error('Baza de date nu are niciun administrator. În producție setați ADMIN_LOGIN și ADMIN_PAROLA la prima pornire.');
    await db.close();
    process.exit(1);
  }
  if (productie && process.env.ADMIN_PAROLA!.length < 12) {
    console.error('ADMIN_PAROLA trebuie să aibă cel puțin 12 caractere.');
    await db.close();
    process.exit(1);
  }
  // Parola implicită „schimba-ma” există doar în dezvoltare, pe baza locală.
  const parola = process.env.ADMIN_PAROLA || 'schimba-ma';
  await salveazaUtilizator(db, { nume: 'Administrator', rol: 'admin', login: process.env.ADMIN_LOGIN || 'admin', parola });
  console.warn(`Cont de administrator creat: ${process.env.ADMIN_LOGIN || 'admin'} / ${process.env.ADMIN_PAROLA ? '(din ADMIN_PAROLA)' : parola} — schimbați parola.`);
}

const app = await construiesteApp({ db, dirWeb: path.join(radacina, 'web', 'dist'), jurnal: process.env.JURNAL !== '0' });
// În producție doar pe interfața locală: Caddy (pe aceeași mașină) e singura cale, prin HTTPS.
// Portul 3000 nu ajunge la internet nici dacă firewall-ul VPS-ului e oprit.
// `||`, nu `??`: o linie „HOST=” goală în fișierul cu variabile ar lega serverul pe toate interfețele.
await app.listen({ port, host: process.env.HOST || (productie ? '127.0.0.1' : '0.0.0.0') });
const legat = app.server.address();
console.log(`Ascultă pe ${typeof legat === 'string' ? legat : `${legat?.address}:${legat?.port}`}`);

// Soldurile închise țin citirile de stoc și de casă la mărimea ultimei ore, nu a întregului istoric.
// Prima închidere (la pornire, după ce serverul ascultă) adună tot istoricul unei baze existente.
let inchidereInCurs = false;
const inchide = async () => {
  if (inchidereInCurs) return;
  inchidereInCurs = true;
  try {
    await inchideSolduri(db);
  } catch (e) {
    console.error(`Închiderea soldurilor a eșuat (se reîncearcă la următoarea oră): ${(e as Error).message}`);
  } finally {
    inchidereInCurs = false;
  }
};
void inchide();
const ceasSolduri = setInterval(inchide, 60 * 60_000);
ceasSolduri.unref();

for (const semnal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(semnal, async () => {
    clearInterval(ceasSolduri);
    await app.close();
    await db.close();
    process.exit(0);
  });
}
