import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alegeImprimanta, alegeTerminal } from './drivere';
import { creeazaPunte } from './server';

const port = Number(process.env.PORT ?? 8099);
const gazda = process.env.HOST ?? '127.0.0.1';
const terminal = alegeTerminal(process.env.TERMINAL);
const imprimanta = alegeImprimanta(process.env.IMPRIMANTA);

// Secretul se introduce o singură dată în POS (Meniu → Echipamente). Vine din PUNTE_SECRET
// sau, la prima pornire, e generat și păstrat în fișierul .secret de lângă punte.
const fisierSecret = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.secret');
let secret = process.env.PUNTE_SECRET;
if (!secret) {
  if (!existsSync(fisierSecret)) writeFileSync(fisierSecret, randomBytes(12).toString('base64url'), { mode: 0o600 });
  secret = readFileSync(fisierSecret, 'utf8').trim();
}

const origine = process.env.ORIGINE;
creeazaPunte(terminal, imprimanta, { secret, origine }).listen(port, gazda, () => {
  console.log(`Puntea ascultă pe http://${gazda}:${port} · ${terminal.nume} · ${imprimanta.nume}`);
  console.log(`Secretul punții (de introdus în POS): ${secret}`);
  if (!origine) console.warn('ORIGINE nu e setată: orice pagină cu secretul poate folosi puntea. În producție: ORIGINE=https://adresa-serverului');
});
