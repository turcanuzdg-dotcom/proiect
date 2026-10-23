export class EroareHttp extends Error {
  constructor(
    public status: number,
    mesaj: string,
    /** Codul erorii trimis de server (de ex. COD_TERMINAL), când există. */
    public cod?: string,
    /** Corpul răspunsului de eroare (câmpuri în plus, de ex. suma aprobată deja). */
    public date?: Record<string, unknown>,
  ) {
    super(mesaj);
  }
}

export interface OptiuniCerere {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  token?: string | null;
  body?: unknown;
  /** ms; o cerere care nu răspunde e tratată ca lipsă de conexiune */
  timeout?: number;
  headers?: Record<string, string>;
}

/** fetch + JSON + mesajul de eroare al serverului; status 0 = fără conexiune. */
export async function cerereJson<T = any>(url: string, opt: OptiuniCerere = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opt.timeout ?? 15_000);
  let r: Response;
  try {
    r = await fetch(url, {
      method: opt.method ?? (opt.body !== undefined ? 'POST' : 'GET'),
      headers: {
        ...(opt.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opt.token ? { Authorization: `Bearer ${opt.token}` } : {}),
        ...opt.headers,
      },
      body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    throw new EroareHttp(0, 'Fără conexiune la server');
  }
  // Timpul limită acoperă și citirea corpului: o legătură care îngheață după antete nu blochează apelantul.
  let text: string;
  try {
    text = await r.text();
  } catch {
    throw new EroareHttp(0, 'Răspunsul serverului s-a întrerupt');
  } finally {
    clearTimeout(timer);
  }
  let date: any = null;
  try {
    date = text ? JSON.parse(text) : null;
  } catch {
    /* răspuns care nu e JSON (de ex. pagina unui proxy) */
  }
  if (!r.ok) {
    const corp = date && typeof date === 'object' ? (date as Record<string, unknown>) : undefined;
    throw new EroareHttp(r.status, date?.eroare ?? `Eroare ${r.status}`, typeof corp?.cod === 'string' ? corp.cod : undefined, corp);
  }
  return date as T;
}
