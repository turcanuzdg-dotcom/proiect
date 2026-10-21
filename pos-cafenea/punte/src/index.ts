import { alegeImprimanta, alegeTerminal } from './drivere';
import { creeazaPunte } from './server';

const port = Number(process.env.PORT ?? 8099);
const gazda = process.env.HOST ?? '127.0.0.1';
const terminal = alegeTerminal(process.env.TERMINAL);
const imprimanta = alegeImprimanta(process.env.IMPRIMANTA);

const origine = process.env.ORIGINE ?? '*';
creeazaPunte(terminal, imprimanta, origine).listen(port, gazda, () => {
  console.log(`Puntea ascultă pe http://${gazda}:${port} · ${terminal.nume} · ${imprimanta.nume}`);
  if (origine === '*') console.warn('ORIGINE nu e setată: orice pagină poate folosi puntea. În producție: ORIGINE=https://adresa-serverului');
});
