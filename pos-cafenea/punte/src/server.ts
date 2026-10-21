import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { ImprimantaFiscala, TerminalPlata } from './drivere';

// Serviciu HTTP mic, pe tabletă sau pe un calculator din cafenea. Rulează câte o operație
// pe rând: terminalul și imprimanta nu acceptă comenzi în paralel.

export interface OptiuniPunte {
  /** Secretul pe care îl trimite POS-ul în antetul X-Punte-Token; fără el, nicio operație. */
  secret: string;
  /** Originea paginii POS (https://...). Lipsă = orice origine (doar pentru dezvoltare). */
  origine?: string;
}

export function creeazaPunte(terminal: TerminalPlata, imprimanta: ImprimantaFiscala, opt: OptiuniPunte) {
  const origine = opt.origine ?? '*';
  let coada: Promise<unknown> = Promise.resolve();
  const pePand = <T>(f: () => Promise<T>) => {
    const p = coada.then(f, f);
    coada = p.catch(() => {});
    return p;
  };

  const raspunde = (res: ServerResponse, status: number, date: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(date));
  };

  const corp = (req: IncomingMessage) =>
    new Promise<any>((ok, eroare) => {
      let s = '';
      req.on('data', (b) => {
        s += b;
        if (s.length > 1_000_000) req.destroy();
      });
      req.on('end', () => {
        try {
          ok(s ? JSON.parse(s) : {});
        } catch (e) {
          eroare(e);
        }
      });
    });

  return createServer(async (req, res) => {
    // Pagina POS vine de pe serverul din cloud (HTTPS), puntea e pe 127.0.0.1: e nevoie de CORS
    // și de permisiunea Chrome pentru acces la rețeaua privată.
    res.setHeader('Access-Control-Allow-Origin', origine);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Punte-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.writeHead(204);
      return res.end();
    }
    try {
      // Antetul X-Punte-Token obligă browserul la cererea preliminară CORS (deci o pagină străină
      // nu poate porni plăți sau bonuri printr-un formular) și autentifică orice client din rețea.
      if (req.headers['x-punte-token'] !== opt.secret) return raspunde(res, 401, { eroare: 'Secretul punții lipsește sau e greșit' });
      if (origine !== '*' && req.headers.origin && req.headers.origin !== origine) return raspunde(res, 403, { eroare: 'Origine neacceptată' });
      const url = req.url ?? '/';
      if (req.method === 'GET' && url === '/stare') return raspunde(res, 200, { terminal: terminal.nume, imprimanta: imprimanta.nume });
      if (req.method !== 'POST') return raspunde(res, 404, { eroare: 'Rută necunoscută' });
      const tip = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (tip !== 'application/json') return raspunde(res, 415, { eroare: 'Se acceptă doar JSON' });
      const d = await corp(req);
      switch (url) {
        case '/terminal/plata':
          return raspunde(res, 200, await pePand(() => terminal.plata(Number(d.suma_bani), String(d.referinta))));
        case '/terminal/retur':
          return raspunde(res, 200, await pePand(() => terminal.retur(Number(d.suma_bani), d.autorizare ?? null, String(d.referinta))));
        case '/imprimanta/bon':
          await pePand(() => imprimanta.bon(d));
          return raspunde(res, 200, { ok: true });
        case '/imprimanta/retur':
          await pePand(() => imprimanta.retur(d));
          return raspunde(res, 200, { ok: true });
        case '/imprimanta/duplicat':
          await pePand(() => imprimanta.duplicat(d));
          return raspunde(res, 200, { ok: true });
        case '/imprimanta/raport-z':
          await pePand(() => imprimanta.raportZ());
          return raspunde(res, 200, { ok: true });
        default:
          return raspunde(res, 404, { eroare: 'Rută necunoscută' });
      }
    } catch (e) {
      // Pentru imprimantă, eroarea (fără hârtie, capac deschis) ajunge la barista ca mesaj.
      return raspunde(res, 200, { ok: false, aprobat: false, mesaj: (e as Error).message });
    }
  });
}
