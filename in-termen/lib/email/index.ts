import "server-only";

import { APP_NAME } from "@/lib/constants";
import { isEmailConfigured, serverConfig } from "@/lib/server-config";

/**
 * Trimiterea e-mailurilor este OPȚIONALĂ și dezactivată implicit.
 * Se activează doar când RESEND_API_KEY și EMAIL_FROM sunt setate.
 * Pentru alt furnizor (Postmark, SES, SMTP), înlocuiește doar funcția sendEmail.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(message: EmailMessage): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) return { ok: false, error: "email_not_configured" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverConfig.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: serverConfig.emailFrom, ...message }),
  });

  if (!response.ok) return { ok: false, error: `resend_${response.status}` };
  return { ok: true };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function reminderEmail(options: {
  title: string;
  body: string | null;
  appUrl: string;
}): Omit<EmailMessage, "to"> {
  const body = options.body ?? "Ai un termen de verificat.";
  const link = `${options.appUrl}/reminders`;
  return {
    subject: `${APP_NAME}: ${options.title}`,
    text: `${options.title}\n\n${body}\n\nVezi detaliile: ${link}\n\nPrimești acest mesaj pentru că ai activat reminderele prin e-mail în ${APP_NAME}.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#0f1b2d">
  <p style="font-size:13px;color:#5b6779;margin:0 0 8px">${APP_NAME}</p>
  <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(options.title)}</h1>
  <p style="font-size:15px;line-height:1.5;margin:0 0 20px">${escapeHtml(body)}</p>
  <a href="${link}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Vezi reminderele</a>
  <p style="font-size:12px;color:#5b6779;margin-top:24px">Primești acest mesaj pentru că ai activat reminderele prin e-mail. Le poți opri din Setări.</p>
</div>`,
  };
}
