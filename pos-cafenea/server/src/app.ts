import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { bazaRaspunde } from './db-comun';
import type { Db } from './db';
import { corpEroare, raspunsLaEroare } from './erori';
import { LIMITA_CORP } from './limite';
import { magistrala, type Notificare } from './magistrala';
import { creeazaBilet, detinatorBilet, dispozitivDinToken, utilizatorDinToken } from './servicii/acces';
import { ruteAdmin } from './rute/admin';
import { rutePOS } from './rute/pos';

export interface OptiuniApp {
  db: Db;
  /** Directorul cu interfața construită (web/dist); servit static dacă există. */
  dirWeb?: string;
  jurnal?: boolean;
  /**
   * Ce proxy-uri sunt de încredere pentru X-Forwarded-For (sintaxa proxy-addr). Implicit TRUST_PROXY
   * sau 'loopback': doar Caddy de pe aceeași mașină. Un client care ajunge direct la Node nu-și mai
   * poate alege adresa (de care țin pauzele de la login și jurnalul de audit).
   */
  trustProxy?: boolean | string;
}

function trustProxyDinMediu(v = process.env.TRUST_PROXY): boolean | string {
  if (!v) return 'loopback';
  if (v === 'true' || v === 'false') return v === 'true';
  return v;
}

// Interfața (pos.html, admin.html) are doar scripturi din fișiere proprii, deci CSP-ul poate fi strict:
// un script injectat n-ar rula și n-ar putea trimite tokenul altundeva. connect-src lasă puntea locală
// de echipamente (punte/, pe 127.0.0.1:8099). HSTS se pune în Caddy, care servește HTTPS.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' http://127.0.0.1:8099",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

const ANTETE_SECURITATE = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

const esteApi = (url: string) => url === '/api' || url.startsWith('/api/') || url.startsWith('/api?');

/** Tokenul vine doar din antet: în URL ar ajunge în jurnalele serverului și ale proxy-ului. */
function tokenDin(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

export async function construiesteApp({ db, dirWeb, jurnal = false, trustProxy = trustProxyDinMediu() }: OptiuniApp) {
  const app = Fastify({
    // În jurnal, adresa fără parametri: acolo pot ajunge bilete și coduri.
    logger: jurnal ? { serializers: { req: (r) => ({ method: r.method, url: r.url.split('?')[0], ip: r.ip }) } } : false,
    bodyLimit: LIMITA_CORP,
    trustProxy,
  });

  app.setErrorHandler((err, _req, reply) => {
    const r = raspunsLaEroare(err);
    if (r) return reply.status(r.status).send(corpEroare(r));
    app.log.error(err);
    return reply.status(500).send({ eroare: 'Eroare internă a serverului' });
  });

  // Antete de securitate pe orice răspuns; CSP pe pagini, „no-store” pe API (date de vânzări, tokenuri).
  app.addHook('onSend', async (req, reply, payload) => {
    reply.headers(ANTETE_SECURITATE);
    if (esteApi(req.url)) reply.header('Cache-Control', 'no-store');
    else reply.header('Content-Security-Policy', CSP);
    return payload;
  });

  const doarAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    const token = tokenDin(req);
    const u = token ? await utilizatorDinToken(db, token) : null;
    if (!u || u.rol !== 'admin') return reply.status(401).send({ eroare: 'Autentificare necesară' });
    req.utilizator = u;
  };
  const doarDispozitiv = async (req: FastifyRequest, reply: FastifyReply) => {
    const token = tokenDin(req);
    const d = token ? await dispozitivDinToken(db, token) : null;
    if (!d) return reply.status(401).send({ eroare: 'Tableta nu este asociată sau a fost dezactivată' });
    req.dispozitiv = d;
  };

  // Verificarea de sănătate (pentru monitorizarea externă) atinge și baza: 503 dacă nu răspunde în 2 s.
  // Jurnal doar peste „warn”: e apelată des.
  app.get('/api/sanatate', { logLevel: 'warn' }, async (req, reply) => {
    if (!(await bazaRaspunde(db, 2_000))) {
      req.log.warn('Verificarea de sănătate: baza de date nu răspunde');
      return reply.status(503).send({ ok: false, eroare: 'Baza de date nu răspunde' });
    }
    return { ok: true, ora: new Date().toISOString() };
  });

  // La oprire (SIGTERM la o actualizare), fluxurile deschise se închid: altfel app.close() le-ar aștepta
  // la nesfârșit. Panoul și tabletele se reconectează singure („retry: 3000”).
  const fluxuri = new Set<ServerResponse>();
  app.addHook('preClose', async () => {
    for (const r of fluxuri) r.end();
    fluxuri.clear();
  });

  // Notificări în timp real: panoul și tabletele își reîncarcă datele când se schimbă ceva.
  // EventSource nu poate trimite antete, deci întâi se cere un bilet scurt, apoi se deschide fluxul cu el.
  app.post('/api/flux/bilet', async (req, reply) => {
    const token = tokenDin(req);
    const u = token ? await utilizatorDinToken(db, token) : null;
    const d = !u && token ? await dispozitivDinToken(db, token) : null;
    if (!u && !d) return reply.status(401).send({ eroare: 'Autentificare necesară' });
    return { bilet: creeazaBilet(u ? { utilizator: u } : { dispozitiv: d! }) };
  });
  app.get('/api/flux', async (req, reply) => {
    const bilet = (req.query as { bilet?: string }).bilet;
    const detinator = typeof bilet === 'string' ? detinatorBilet(bilet) : null;
    if (!detinator) return reply.status(401).send({ eroare: 'Bilet lipsă sau expirat' });
    const d = detinator.dispozitiv ?? null;
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      ...ANTETE_SECURITATE,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    fluxuri.add(res);
    res.write('retry: 3000\n\n');
    const asculta = (n: Notificare) => {
      if (d && n.locatie_id != null && n.locatie_id !== d.locatie_id) return;
      res.write(`data: ${JSON.stringify(n)}\n\n`);
    };
    const puls = setInterval(() => res.write(': puls\n\n'), 25_000);
    magistrala.on('notificare', asculta);
    // Clientul a plecat sau serverul a închis fluxul la oprire.
    res.on('close', () => {
      clearInterval(puls);
      magistrala.off('notificare', asculta);
      fluxuri.delete(res);
    });
  });

  await app.register(async (pos) => rutePOS(pos, db, doarDispozitiv));
  await app.register(async (adm) => ruteAdmin(adm, db, doarAdmin));

  if (dirWeb && existsSync(dirWeb)) {
    await app.register(fastifyStatic, { root: dirWeb, index: ['index.html'] });
    app.get('/pos', (_req, reply) => reply.redirect('/pos.html'));
    app.get('/admin', (_req, reply) => reply.redirect('/admin.html'));
  }

  return app;
}
