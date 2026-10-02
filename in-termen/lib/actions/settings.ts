"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { fail, GENERIC_ERROR, getActionSession, mapDatabaseError, NOT_AUTHENTICATED } from "@/lib/actions/context";
import type { SessionContext } from "@/lib/auth";
import { DELETE_CONFIRMATION_WORD, STORAGE_BUCKET } from "@/lib/constants";
import { buildDemoPayload } from "@/lib/demo";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { isEmailConfigured } from "@/lib/server-config";
import { todayInTimeZone } from "@/lib/utils/dates";
import { fieldErrorsFrom, firstErrorMessage } from "@/lib/validations/common";
import {
  notificationSettingsSchema,
  onboardingSchema,
  profileSettingsSchema,
  type OnboardingValues,
  type ProfileSettingsValues,
} from "@/lib/validations/misc";
import type { ActionResult } from "@/types/domain";

async function insertDemoData(session: SessionContext): Promise<{ error: string | null }> {
  const { profile, supabase } = session;
  const payload = buildDemoPayload({
    today: todayInTimeZone(profile.timezone),
    timeZone: profile.timezone,
    channel: profile.email_notifications && isEmailConfigured() ? "email" : "in_app",
    currency: profile.default_currency,
    reminderDays: profile.default_reminder_days,
  });
  const { error } = await supabase.rpc("seed_demo_data", {
    p_family_member: payload.familyMember,
    p_documents: payload.documents,
  });
  return { error: error ? mapDatabaseError(error) : null };
}

export async function updateProfileSettings(values: ProfileSettingsValues): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;

  const parsed = profileSettingsSchema.safeParse(values);
  if (!parsed.success) return fail(firstErrorMessage(parsed.error), fieldErrorsFrom(parsed.error));

  const { error } = await session.supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      timezone: parsed.data.timezone,
      default_currency: parsed.data.defaultCurrency,
      default_reminder_days: parsed.data.defaultReminderDays,
    })
    .eq("id", session.user.id);
  if (error) return fail(mapDatabaseError(error));

  revalidatePath("/", "layout");
  return { ok: true, data: undefined, message: "Preferințe salvate." };
}

export async function updateNotificationSettings(values: {
  inAppNotifications: boolean;
  emailNotifications: boolean;
}): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;

  const parsed = notificationSettingsSchema.safeParse(values);
  if (!parsed.success) return fail(firstErrorMessage(parsed.error));

  if (parsed.data.emailNotifications && !isEmailConfigured()) {
    return fail("Notificările prin e-mail nu sunt configurate încă.");
  }

  const { error } = await session.supabase
    .from("profiles")
    .update({
      in_app_notifications: parsed.data.inAppNotifications,
      email_notifications: parsed.data.emailNotifications,
    })
    .eq("id", session.user.id);
  if (error) return fail(mapDatabaseError(error));

  revalidatePath("/", "layout");
  return {
    ok: true,
    data: undefined,
    message: "Notificări salvate. Se aplică reminderelor create de acum înainte.",
  };
}

export async function completeOnboarding(values: OnboardingValues): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;

  const parsed = onboardingSchema.safeParse(values);
  if (!parsed.success) return fail(firstErrorMessage(parsed.error));

  const emailNotifications = parsed.data.emailNotifications && isEmailConfigured();
  const { error } = await session.supabase
    .from("profiles")
    .update({
      tracked_categories: parsed.data.categories,
      email_notifications: emailNotifications,
      onboarding_completed: true,
    })
    .eq("id", session.user.id);
  if (error) return fail(mapDatabaseError(error));

  if (parsed.data.addDemoData) {
    const result = await insertDemoData({
      ...session,
      profile: { ...session.profile, email_notifications: emailNotifications },
    });
    if (result.error) return fail(result.error);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard?bun-venit=1");
}

export async function seedDemoData(): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;

  const result = await insertDemoData(session);
  if (result.error) return fail(result.error);

  revalidatePath("/", "layout");
  return { ok: true, data: undefined, message: "Date demonstrative adăugate. Toate sunt fictive." };
}

export async function removeDemoData(): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;

  const { error } = await session.supabase.rpc("remove_demo_data");
  if (error) return fail(mapDatabaseError(error));

  revalidatePath("/", "layout");
  return { ok: true, data: undefined, message: "Date demonstrative șterse. Datele tale au rămas neatinse." };
}

/** Șterge toate fișierele din dosarul utilizatorului, pagină cu pagină. */
async function removeAllUserFiles(session: SessionContext): Promise<boolean> {
  const bucket = session.supabase.storage.from(STORAGE_BUCKET);
  for (let round = 0; round < 50; round += 1) {
    const { data, error } = await bucket.list(session.user.id, { limit: 100 });
    if (error) return false;
    if (!data || data.length === 0) return true;
    const paths = data.map((item) => `${session.user.id}/${item.name}`);
    const { error: removeError } = await bucket.remove(paths);
    if (removeError) return false;
  }
  return false;
}

export async function deleteAllMyData(confirmation: string): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;

  if (confirmation.trim().toLocaleUpperCase("ro-RO") !== DELETE_CONFIRMATION_WORD) {
    return fail(`Scrie „${DELETE_CONFIRMATION_WORD}” pentru a confirma.`);
  }
  if (!checkRateLimit("destructive", session.user.id).allowed) return fail(RATE_LIMIT_MESSAGE);

  const filesRemoved = await removeAllUserFiles(session);
  if (!filesRemoved)
    return fail("Nu am putut șterge toate fișierele. Nimic altceva nu a fost șters; încearcă din nou.");

  const { error } = await session.supabase.rpc("delete_my_data");
  if (error) return fail(GENERIC_ERROR);

  revalidatePath("/", "layout");
  return { ok: true, data: undefined, message: "Toate documentele, fișierele și reminderele tale au fost șterse." };
}
