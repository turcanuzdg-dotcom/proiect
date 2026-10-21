import { existsSync } from 'node:fs';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import type { Db } from './db';
import { EroareUtilizator } from './erori';
import { magistrala, type Notificare } from './magistrala';
import { creeazaBilet, detinatorBilet, dispozitivDinToken, utilizatorDinToken, type DispozitivAutentificat, type UtilizatorAutentificat } from './servicii/acces';
import { ruteAdmin } from './rute/admin';
import { rutePOS } from './rute/pos';

declare module 'fastify' {
  interface FastifyRequest {
    utilizator?: UtilizatorAutentificat;
    dispozitiv?: DispozitivAutentificat;
  }
}

export interface OptiuniApp {
  db: Db;
  /** Directorul cu interfața construită (web/dist); servit static dacă există. */
  dirWeb?: string;
  jurnal?: boolean;
}

/** Tokenul vine doar din antet: în URL ar ajunge în jurnalele serverului și ale proxy-ului. */
function tokenDin(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

export async function construiesteApp({ db, dirWeb, jurnal = false }: OptiuniApp) {
  const app = Fastify({
    // În jurnal, adresa fără parametri: acolo pot ajunge bilete și coduri.
    logger: jurnal ? { serializers: { req: (r) => ({ method: r.method, url: r.url.split('?')[0], ip: r.ip }) } } : false,
    bodyLimit: 5 * 1024 * 1024,
    trustProxy: true,
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ eroare: err.issues.map((i) => `${i.path.join('.') || 'cerere'}: ${i.message}`).join('; ') });
    }
    if (err instanceof EroareUtilizator) return reply.status(err.status).send({ eroare: err.message });
    const e = err as { code?: string; statusCode?: number; message?: string };
    if (e.code === '23505') return reply.status(409).send({ eroare: 'Există deja o înregistrare cu acest nume' });
    if (e.code === '23503') return reply.status(409).send({ eroare: 'Înregistrarea e folosită în alte documente sau trimite la ceva inexistent' });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ eroare: e.message });
    app.log.error(err);
    return reply.status(500).send({ eroare: 'Eroare internă a serverului' });
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

  app.get('/api/sanatate', async () => ({ ok: true, ora: new Date().toISOString() }));

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
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const asculta = (n: Notificare) => {
      if (d && n.locatie_id != null && n.locatie_id !== d.locatie_id) return;
      res.write(`data: ${JSON.stringify(n)}\n\n`);
    };
    const puls = setInterval(() => res.write(': puls\n\n'), 25_000);
    magistrala.on('notificare', asculta);
    req.raw.on('close', () => {
      clearInterval(puls);
      magistrala.off('notificare', asculta);
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
