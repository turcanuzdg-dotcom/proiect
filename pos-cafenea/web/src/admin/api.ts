import { cerereJson, EroareHttp } from '../comun/http';

const CHEIE_TOKEN = 'cafenea-admin-token';
// Tokenul stă și în memorie: dacă browserul blochează localStorage, sesiunea ține cât e deschisă pagina.
let tokenMemorie: string | null = null;

export function citesteToken(): string | null {
  if (tokenMemorie) return tokenMemorie;
  try {
    tokenMemorie = localStorage.getItem(CHEIE_TOKEN);
  } catch {
    /* stocare blocată */
  }
  return tokenMemorie;
}

export function salveazaToken(token: string | null) {
  tokenMemorie = token;
  try {
    if (token) localStorage.setItem(CHEIE_TOKEN, token);
    else localStorage.removeItem(CHEIE_TOKEN);
  } catch {
    /* stocare blocată: sesiunea ține doar cât e deschisă pagina */
  }
}

let laNeautorizat: (() => void) | null = null;
/** Apelat când serverul răspunde 401 (sesiune expirată): aplicația revine la login. */
export function candSesiuneaExpira(fn: () => void) {
  laNeautorizat = fn;
}

export function qs(params?: Record<string, unknown>): string {
  if (!params) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function cerere<T>(url: string, method: 'GET' | 'POST' | 'PUT', body?: unknown): Promise<T> {
  try {
    return await cerereJson<T>(url, { method, body, token: citesteToken() });
  } catch (e) {
    if (e instanceof EroareHttp && e.status === 401 && !url.startsWith('/api/auth/login')) {
      salveazaToken(null);
      laNeautorizat?.();
    }
    throw e;
  }
}

export const api = {
  get: <T = any>(url: string, params?: Record<string, unknown>) => cerere<T>(url + qs(params), 'GET'),
  post: <T = any>(url: string, body: unknown = {}) => cerere<T>(url, 'POST', body),
  put: <T = any>(url: string, body: unknown = {}) => cerere<T>(url, 'PUT', body),
};

export function mesajEroare(e: unknown): string {
  if (e instanceof EroareHttp) return e.status === 0 ? 'Fără conexiune la server. Reîncercați.' : e.message;
  return e instanceof Error ? e.message : String(e);
}
