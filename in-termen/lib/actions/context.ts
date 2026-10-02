import "server-only";

import { getSession, type SessionContext } from "@/lib/auth";
import type { ActionResult } from "@/types/domain";

export const NOT_AUTHENTICATED: ActionResult<never> = {
  ok: false,
  error: "Sesiunea a expirat. Autentifică-te din nou.",
};

export const GENERIC_ERROR = "Ceva n-a mers bine. Încearcă din nou peste câteva momente.";

/** Sesiunea pentru o acțiune de server sau null (acțiunea întoarce atunci NOT_AUTHENTICATED). */
export async function getActionSession(): Promise<SessionContext | null> {
  return getSession();
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Traduce erorile Postgres/PostgREST în mesaje pentru utilizator. */
export function mapDatabaseError(error: { code?: string; message?: string } | null): string {
  if (!error) return GENERIC_ERROR;
  if (error.code === "P0002" || error.message?.includes("document_not_found")) {
    return "Documentul nu a fost găsit sau nu îți aparține.";
  }
  if (error.code === "42501") return "Nu ai acces la această înregistrare.";
  if (error.code === "23514") return "Unele date nu respectă regulile (de ex. data emiterii după data expirării).";
  if (error.code === "23503") return "O legătură nu mai există (de ex. persoana a fost ștearsă). Reîncarcă pagina.";
  return GENERIC_ERROR;
}
