/**
 * Configurație publică (sigură pentru client). Variabilele secrete se citesc doar în lib/server-config.ts.
 */

const DEFAULT_MAX_UPLOAD_MB = 10;

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const publicConfig = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  maxUploadMb: parsePositiveNumber(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB, DEFAULT_MAX_UPLOAD_MB),
} as const;

export const maxUploadBytes = Math.round(publicConfig.maxUploadMb * 1024 * 1024);

export function isSupabaseConfigured(): boolean {
  return Boolean(publicConfig.supabaseUrl && publicConfig.supabaseAnonKey);
}
