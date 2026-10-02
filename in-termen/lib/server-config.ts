import "server-only";

/**
 * Configurație doar pentru server. Nu importa acest fișier din componente client.
 */
export const serverConfig = {
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  ocrProvider: (process.env.OCR_PROVIDER ?? "").toLowerCase(),
  googleVisionApiKey: process.env.GOOGLE_VISION_API_KEY ?? "",
} as const;

export function isEmailConfigured(): boolean {
  return Boolean(serverConfig.resendApiKey && serverConfig.emailFrom);
}

export function isOcrConfigured(): boolean {
  if (serverConfig.ocrProvider === "google_vision") {
    return Boolean(serverConfig.googleVisionApiKey);
  }
  return false;
}
