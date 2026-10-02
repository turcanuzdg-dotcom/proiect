"use server";

import { revalidatePath } from "next/cache";

import { fail, getActionSession, mapDatabaseError, NOT_AUTHENTICATED } from "@/lib/actions/context";
import { computeSnoozeUntil } from "@/lib/reminders/schedule";
import { isEmailConfigured } from "@/lib/server-config";
import { daysBetween, formatRoDateTime, todayInTimeZone, zonedDateTimeToUtcISO } from "@/lib/utils/dates";
import { fieldErrorsFrom, firstErrorMessage, uuidSchema } from "@/lib/validations/common";
import {
  manualReminderSchema,
  snoozeReminderSchema,
  type ManualReminderValues,
  type SnoozeReminderInput,
} from "@/lib/validations/misc";
import type { ActionResult } from "@/types/domain";

function revalidateReminderPages(documentId?: string | null) {
  revalidatePath("/dashboard");
  revalidatePath("/reminders");
  if (documentId) revalidatePath(`/documents/${documentId}`);
}

export async function completeReminder(reminderId: string): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;
  if (!uuidSchema.safeParse(reminderId).success) return fail("Reminderul nu a fost găsit. Reîncarcă pagina.");

  const now = new Date().toISOString();
  const { data, error } = await session.supabase
    .from("reminders")
    .update({ status: "completed", completed_at: now, read_at: now, snoozed_until: null })
    .eq("id", reminderId)
    .select("id, document_id, title")
    .maybeSingle();
  if (error) return fail(mapDatabaseError(error));
  if (!data) return fail("Reminderul nu a fost găsit.");

  if (data.document_id) {
    await session.supabase
      .from("activity_logs")
      .insert({ document_id: data.document_id, action: "reminder_completed", metadata: { title: data.title } });
  }

  revalidateReminderPages(data.document_id);
  return { ok: true, data: undefined, message: "Reminder rezolvat." };
}

export async function reopenReminder(reminderId: string): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;
  if (!uuidSchema.safeParse(reminderId).success) return fail("Reminderul nu a fost găsit. Reîncarcă pagina.");

  const { data, error } = await session.supabase
    .from("reminders")
    .update({ status: "pending", completed_at: null })
    .eq("id", reminderId)
    .select("id, document_id")
    .maybeSingle();
  if (error || !data) return fail(mapDatabaseError(error));

  revalidateReminderPages(data.document_id);
  return { ok: true, data: undefined, message: "Reminderul este din nou activ." };
}

export async function snoozeReminder(input: SnoozeReminderInput): Promise<ActionResult<{ until: string }>> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;

  const parsed = snoozeReminderSchema.safeParse(input);
  if (!parsed.success) return fail(firstErrorMessage(parsed.error));

  const { profile, supabase } = session;
  const { reminderId, option } = parsed.data;
  if (option.kind === "date" && daysBetween(todayInTimeZone(profile.timezone), option.date) <= 0) {
    return fail("Alege o dată din viitor.");
  }

  const until = computeSnoozeUntil(option, new Date(), profile.timezone);
  const { data, error } = await supabase
    .from("reminders")
    .update({ status: "snoozed", snoozed_until: until, read_at: null })
    .eq("id", reminderId)
    .in("status", ["pending", "snoozed"])
    .select("id, document_id, title")
    .maybeSingle();
  if (error) return fail(mapDatabaseError(error));
  if (!data) return fail("Reminderul nu a fost găsit sau este deja finalizat.");

  if (data.document_id) {
    await supabase
      .from("activity_logs")
      .insert({ document_id: data.document_id, action: "reminder_snoozed", metadata: { until } });
  }

  revalidateReminderPages(data.document_id);
  return {
    ok: true,
    data: { until },
    message: `Reminder amânat până pe ${formatRoDateTime(until, profile.timezone)}.`,
  };
}

export async function createManualReminder(values: ManualReminderValues): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;

  const parsed = manualReminderSchema.safeParse(values);
  if (!parsed.success) return fail(firstErrorMessage(parsed.error), fieldErrorsFrom(parsed.error));

  const { profile, supabase } = session;
  const { title, body, date, time, channel } = parsed.data;
  if (daysBetween(todayInTimeZone(profile.timezone), date) < 0) {
    return fail("Alege o dată de astăzi sau din viitor.", { date: ["Alege o dată de astăzi sau din viitor."] });
  }

  const [hour, minute] = time.split(":").map(Number);
  const { error } = await supabase.from("reminders").insert({
    title,
    body: body || null,
    remind_at: zonedDateTimeToUtcISO(date, hour, profile.timezone, minute),
    channel: channel === "email" && isEmailConfigured() ? "email" : "in_app",
  });
  if (error) return fail(mapDatabaseError(error));

  revalidateReminderPages();
  return { ok: true, data: undefined, message: "Reminder adăugat." };
}

export async function deleteReminder(reminderId: string): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;
  if (!uuidSchema.safeParse(reminderId).success) return fail("Reminderul nu a fost găsit. Reîncarcă pagina.");

  const { data, error } = await session.supabase
    .from("reminders")
    .delete()
    .eq("id", reminderId)
    .select("id, document_id")
    .maybeSingle();
  if (error) return fail(mapDatabaseError(error));

  revalidateReminderPages(data?.document_id);
  return { ok: true, data: undefined, message: "Reminder șters." };
}

/** Marchează notificările scadente ca citite (la deschiderea clopoțelului). */
export async function markNotificationsRead(): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;

  const now = new Date().toISOString();
  const { error } = await session.supabase
    .from("reminders")
    .update({ read_at: now })
    .is("read_at", null)
    .or(`and(status.eq.pending,remind_at.lte.${now}),and(status.eq.snoozed,snoozed_until.lte.${now})`);
  if (error) return fail(mapDatabaseError(error));

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
