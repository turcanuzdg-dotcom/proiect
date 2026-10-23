import { ZodError } from 'zod';

/** Eroare provocată de date greșite: ajunge la client ca 400 cu mesajul în română. */
export class EroareUtilizator extends Error {
  constructor(
    mesaj: string,
    public status = 400,
    /** Cod pe care clientul îl recunoaște fără să citească textul (de ex. COD_TERMINAL). */
    public codEroare?: string,
    /** Câmpuri în plus în corpul răspunsului (de ex. suma aprobată deja). */
    public detalii?: Record<string, unknown>,
  ) {
    super(mesaj);
  }
}

export class EroareNegasit extends EroareUtilizator {
  constructor(ce: string) {
    super(`${ce} nu există`, 404);
  }
}

/**
 * Răspunsul pentru o eroare aruncată de o rută; `null` = eroare internă (se scrie în jurnal, clientul
 * primește doar 500). Îl folosesc serverul (app.ts) și simularea din browser, ca să răspundă la fel.
 */
export function raspunsLaEroare(err: unknown): { status: number; eroare: string; cod?: string; detalii?: Record<string, unknown> } | null {
  if (err instanceof ZodError) {
    return { status: 400, eroare: err.issues.map((i) => `${i.path.join('.') || 'cerere'}: ${i.message}`).join('; ') };
  }
  if (err instanceof EroareUtilizator) return { status: err.status, eroare: err.message, cod: err.codEroare, detalii: err.detalii };
  const e = err as { code?: unknown; statusCode?: number; message?: string };
  if (e.code === '23505') return { status: 409, eroare: 'Există deja o înregistrare cu acest nume' };
  if (e.code === '23503') return { status: 409, eroare: 'Înregistrarea e folosită în alte documente sau trimite la ceva inexistent' };
  // Clasa SQLSTATE 22: PostgreSQL a respins o valoare din cerere (dată greșită, număr prea mare).
  // E o greșeală a cererii, nu o defecțiune a serverului.
  if (typeof e.code === 'string' && /^22[0-9A-Z]{3}$/.test(e.code)) return { status: 400, eroare: 'Valoare invalidă în cerere' };
  if (e.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return { status: 413, eroare: 'Cererea este prea mare' };
  if (e.statusCode && e.statusCode < 500) return { status: e.statusCode, eroare: e.message ?? 'Cerere greșită' };
  return null;
}

/** Corpul JSON al unui răspuns de eroare: mesajul, plus codul și detaliile, când există. */
export const corpEroare = (r: { eroare: string; cod?: string; detalii?: Record<string, unknown> }) => ({
  ...r.detalii,
  eroare: r.eroare,
  ...(r.cod ? { cod: r.cod } : {}),
});
