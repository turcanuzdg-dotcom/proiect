// Un înlocuitor minim pentru Fastify: rutele reale (server/src/rute) se înregistrează aici și
// răspund la cererile tabletei și ale panoului direct în browser, fără rețea.
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { EroareUtilizator } from '../../../server/src/erori';

type Handler = (req: CerereSim, reply: RaspunsSim) => unknown;

export interface CerereSim {
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  ip: string;
  [k: string]: unknown;
}

export class RaspunsSim {
  statusCode = 200;
  corp: unknown = undefined;
  sent = false;
  status(c: number) {
    this.statusCode = c;
    return this;
  }
  code(c: number) {
    return this.status(c);
  }
  send(corp?: unknown) {
    this.corp = corp;
    this.sent = true;
    return this;
  }
  header() {
    return this;
  }
}

interface Ruta {
  metoda: string;
  segmente: string[];
  hooks: Handler[];
  handler: Handler;
}

export interface RezultatCerere {
  status: number;
  corp: string;
}

/** La fel ca setErrorHandler din server/src/app.ts. */
function raspunsEroare(err: unknown): { status: number; corp: unknown } {
  if (err instanceof ZodError) {
    return { status: 400, corp: { eroare: err.issues.map((i) => `${i.path.join('.') || 'cerere'}: ${i.message}`).join('; ') } };
  }
  if (err instanceof EroareUtilizator) return { status: err.status, corp: { eroare: err.message } };
  const e = err as { code?: string; statusCode?: number; message?: string };
  if (e.code === '23505') return { status: 409, corp: { eroare: 'Există deja o înregistrare cu acest nume' } };
  if (e.code === '23503') return { status: 409, corp: { eroare: 'Înregistrarea e folosită în alte documente sau trimite la ceva inexistent' } };
  if (e.statusCode && e.statusCode < 500) return { status: e.statusCode, corp: { eroare: e.message } };
  console.error(err);
  return { status: 500, corp: { eroare: 'Eroare internă a serverului' } };
}

export class RuterSim {
  private rute: Ruta[] = [];
  private inregistrari: Promise<unknown>[] = [];

  /** Instanța „Fastify” pe care o primesc rutePOS și ruteAdmin. */
  instanta(hooks: Handler[] = []): FastifyInstance {
    const adauga = (metoda: string) => (cale: string, handler: Handler) => {
      this.rute.push({ metoda, segmente: cale.split('/').filter(Boolean), hooks, handler });
    };
    const inst = {
      get: adauga('GET'),
      post: adauga('POST'),
      put: adauga('PUT'),
      delete: adauga('DELETE'),
      // Ca în Fastify, un hook adăugat într-un plugin se aplică doar rutelor din el.
      addHook: (_nume: 'preHandler', fn: Handler) => void hooks.push(fn),
      register: (plugin: (copil: FastifyInstance) => unknown) => {
        const p = Promise.resolve(plugin(this.instanta([...hooks])));
        this.inregistrari.push(p);
        return p;
      },
    };
    return inst as unknown as FastifyInstance;
  }

  async gata() {
    // Pluginurile se înregistrează și în cascadă; așteptăm până nu mai apar altele.
    for (let n = 0; n !== this.inregistrari.length; ) {
      n = this.inregistrari.length;
      await Promise.all(this.inregistrari);
    }
  }

  private gaseste(metoda: string, cale: string) {
    const parti = cale.split('/').filter(Boolean).map(decodeURIComponent);
    for (const r of this.rute) {
      if (r.metoda !== metoda || r.segmente.length !== parti.length) continue;
      const params: Record<string, string> = {};
      if (r.segmente.every((s, i) => (s.startsWith(':') ? ((params[s.slice(1)] = parti[i]), true) : s === parti[i]))) return { ruta: r, params };
    }
    return null;
  }

  async trateaza(metoda: string, adresa: string, antete: Record<string, string | undefined>, corp: string | null): Promise<RezultatCerere> {
    const url = new URL(adresa, 'http://simulare.local');
    const gasit = this.gaseste(metoda, url.pathname);
    if (!gasit) return { status: 404, corp: JSON.stringify({ eroare: `Ruta ${metoda} ${url.pathname} nu există` }) };
    const req: CerereSim = {
      method: metoda,
      url: url.pathname + url.search,
      headers: antete,
      params: gasit.params,
      query: Object.fromEntries(url.searchParams),
      body: corp ? JSON.parse(corp) : undefined,
      ip: '127.0.0.1',
    };
    const reply = new RaspunsSim();
    try {
      for (const h of gasit.ruta.hooks) {
        await h(req, reply);
        if (reply.sent) return { status: reply.statusCode, corp: JSON.stringify(reply.corp ?? null) };
      }
      const rez = await gasit.ruta.handler(req, reply);
      const corpRaspuns = reply.sent ? reply.corp : rez;
      return { status: reply.statusCode, corp: corpRaspuns === undefined ? '' : JSON.stringify(corpRaspuns) };
    } catch (e) {
      const r = raspunsEroare(e);
      return { status: r.status, corp: JSON.stringify(r.corp) };
    }
  }
}
