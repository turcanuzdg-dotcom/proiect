import { z } from "zod";

import { isISODate } from "@/lib/utils/dates";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuidSchema = z.string().regex(UUID_RE, "Identificator invalid.");

export const isoDateSchema = z
  .string({ error: "Alege o dată." })
  .refine((value) => isISODate(value), "Data nu este validă.");

export const optionalIsoDateSchema = z
  .string()
  .refine((value) => value === "" || isISODate(value), "Data nu este validă.");

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Transformă erorile Zod în { câmp: [mesaje] } pentru afișare lângă câmpuri. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

export function firstErrorMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Verifică câmpurile marcate și încearcă din nou.";
}
