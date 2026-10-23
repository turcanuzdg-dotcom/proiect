// Un înlocuitor minim pentru Fastify: rutele reale (server/src/rute) se înregistrează aici și
// răspund la cererile tabletei și ale panoului direct în browser, fără rețea.
import type { FastifyInstance } from 'fastify';
import { raspunsLaEroare } from '../../../server/src/erori';

type Handler = (req: CerereSim, reply: RaspunsSim) => unknown;

/** Etapele din Fastify folosite de rute: verificarea accesului (onRequest), apoi rutele, apoi jurnalul (onResponse). */
type Etapa = 'onRequest' | 'preHandler' | 'onResponse';
type Hooks = Record<Etapa, Handler[]>;

const jurnalSim = {
  error: (...a: unknown[]) => console.error(...a),
  warn: (...a: unknown[]) => console.warn(...a),
  info: () => {},
  debug: () => {},
};

export interface CerereSim {
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  ip: string;
  routeOptions: { url: string };
  log: typeof jurnalSim;
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
  headers() {
    return this;
  }
}

interface Ruta {
  metoda: string;
  cale: string;
  segmente: string[];
  hooks: Hooks;
  handler: Handler;
}

export interface RezultatCerere {
  status: number;
  corp: string;
}

/** La fel ca setErrorHandler din server/src/app.ts (aceeași funcție). */
function raspunsEroare(err: unknown): { status: number; corp: unknown } {
  const r = raspunsLaEroare(err);
  if (r) return { status: r.status, corp: { eroare: r.eroare } };
  console.error(err);
  return { status: 500, corp: { eroare: 'Eroare internă a serverului' } };
}

const copie = (h: Hooks): Hooks => ({ onRequest: [...h.onRequest], preHandler: [...h.preHandler], onResponse: [...h.onResponse] });

export class RuterSim {
  private rute: Ruta[] = [];
  private inregistrari: Promise<unknown>[] = [];
  private laInchidere: (() => unknown)[] = [];

  /** Instanța „Fastify” pe care o primesc rutePOS și ruteAdmin. */
  instanta(hooks: Hooks = { onRequest: [], preHandler: [], onResponse: [] }): FastifyInstance {
    // Ca în Fastify: (cale, handler) sau (cale, opțiuni, handler); opțiunile (bodyLimit, logLevel) nu contează aici.
    const adauga =
      (metoda: string) =>
      (cale: string, a: Handler | object, b?: Handler) => {
        const handler = (typeof a === 'function' ? a : b) as Handler;
        this.rute.push({ metoda, cale, segmente: cale.split('/').filter(Boolean), hooks, handler });
      };
    const inst = {
      get: adauga('GET'),
      post: adauga('POST'),
      put: adauga('PUT'),
      delete: adauga('DELETE'),
      // Ca în Fastify, un hook adăugat într-un plugin se aplică doar rutelor din el (și din copiii lui).
      addHook: (etapa: Etapa | 'onClose', fn: Handler) => {
        // onClose ține de aplicație, nu de rute: rulează o singură dată, la inchide().
        if (etapa === 'onClose') return void this.laInchidere.push(fn as unknown as () => unknown);
        if (!(etapa in hooks)) throw new Error(`Simularea nu cunoaște hook-ul ${etapa}`);
        hooks[etapa].push(fn);
      },
      register: (plugin: (copil: FastifyInstance) => unknown) => {
        const p = Promise.resolve(plugin(this.instanta(copie(hooks))));
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

  /** Ca app.close() din Fastify: rulează hook-urile onClose (de ex. scrierea loginurilor eșuate numărate). */
  async inchide() {
    const h = this.laInchidere.splice(0);
    for (const fn of h) {
      try {
        await fn();
      } catch (e) {
        console.error(e);
      }
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
    const { ruta } = gasit;
    const req: CerereSim = {
      method: metoda,
      url: url.pathname + url.search,
      headers: antete,
      params: gasit.params,
      query: Object.fromEntries(url.searchParams),
      body: undefined,
      ip: '127.0.0.1',
      routeOptions: { url: ruta.cale },
      log: jurnalSim,
    };
    const reply = new RaspunsSim();
    const rezultat = await this.executa(ruta, req, reply, corp);
    // Ca onResponse din Fastify: după răspuns; o eroare aici nu schimbă răspunsul.
    for (const h of ruta.hooks.onResponse) {
      try {
        await h(req, reply);
      } catch (e) {
        console.error(e);
      }
    }
    return rezultat;
  }

  private async executa(ruta: Ruta, req: CerereSim, reply: RaspunsSim, corp: string | null): Promise<RezultatCerere> {
    const raspuns = () => ({ status: reply.statusCode, corp: JSON.stringify(reply.corp ?? null) });
    try {
      for (const h of ruta.hooks.onRequest) {
        await h(req, reply);
        if (reply.sent) return raspuns();
      }
      // Corpul se citește abia după onRequest, ca în Fastify.
      req.body = corp ? JSON.parse(corp) : undefined;
      for (const h of ruta.hooks.preHandler) {
        await h(req, reply);
        if (reply.sent) return raspuns();
      }
      const rez = await ruta.handler(req, reply);
      const corpRaspuns = reply.sent ? reply.corp : rez;
      return { status: reply.statusCode, corp: corpRaspuns === undefined ? '' : JSON.stringify(corpRaspuns) };
    } catch (e) {
      const r = raspunsEroare(e);
      reply.statusCode = r.status;
      return { status: r.status, corp: JSON.stringify(r.corp) };
    }
  }
}
