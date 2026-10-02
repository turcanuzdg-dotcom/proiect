import { NextResponse, type NextRequest } from "next/server";

import { publicConfig } from "@/lib/config";
import { reminderEmail, sendEmail } from "@/lib/email";
import { isEmailConfigured, serverConfig } from "@/lib/server-config";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Job zilnic (de ex. Vercel Cron, vezi vercel.json). Protejat cu CRON_SECRET.
 *
 * 1. Reactivează reminderele amânate al căror termen de amânare a sosit.
 * 2. Dacă e-mailul este configurat, trimite reminderele scadente cu canalul „email”.
 *
 * Reminderele în aplicație nu au nevoie de job: sunt create la salvarea documentului
 * și apar automat când le vine momentul.
 */
export async function GET(request: NextRequest) {
  if (!serverConfig.cronSecret || request.headers.get("authorization") !== `Bearer ${serverConfig.cronSecret}`) {
    return NextResponse.json({ error: "Neautorizat." }, { status: 401 });
  }
  if (!serverConfig.supabaseServiceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY lipsește." }, { status: 503 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // 1. Amânările expirate devin din nou remindere programate, la momentul amânării.
  const { data: snoozed, error: snoozeError } = await supabase
    .from("reminders")
    .select("id, snoozed_until")
    .eq("status", "snoozed")
    .lte("snoozed_until", now)
    .limit(500);
  if (snoozeError) return NextResponse.json({ error: "Nu am putut citi reminderele." }, { status: 500 });

  for (const reminder of snoozed ?? []) {
    await supabase
      .from("reminders")
      .update({ status: "pending", remind_at: reminder.snoozed_until ?? now, snoozed_until: null })
      .eq("id", reminder.id);
  }

  // 2. E-mailuri (opțional).
  let emailed = 0;
  let emailFailures = 0;
  if (isEmailConfigured()) {
    const { data: due } = await supabase
      .from("reminders")
      .select("id, user_id, title, body")
      .eq("channel", "email")
      .eq("status", "pending")
      .is("emailed_at", null)
      .lte("remind_at", now)
      .limit(200);

    const emails = new Map<string, string | null>();
    for (const reminder of due ?? []) {
      if (!emails.has(reminder.user_id)) {
        const { data } = await supabase.auth.admin.getUserById(reminder.user_id);
        emails.set(reminder.user_id, data.user?.email ?? null);
      }
      const to = emails.get(reminder.user_id);
      if (!to) continue;

      const result = await sendEmail({
        to,
        ...reminderEmail({ title: reminder.title, body: reminder.body, appUrl: publicConfig.siteUrl }),
      });
      if (result.ok) {
        emailed += 1;
        await supabase.from("reminders").update({ emailed_at: new Date().toISOString() }).eq("id", reminder.id);
      } else {
        emailFailures += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    reactivated: snoozed?.length ?? 0,
    emailConfigured: isEmailConfigured(),
    emailed,
    emailFailures,
  });
}
