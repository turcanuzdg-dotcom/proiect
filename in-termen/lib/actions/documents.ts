"use server";

import { revalidatePath } from "next/cache";

import { fail, GENERIC_ERROR, getActionSession, mapDatabaseError, NOT_AUTHENTICATED } from "@/lib/actions/context";
import { maxUploadBytes } from "@/lib/config";
import { STORAGE_BUCKET } from "@/lib/constants";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import {
  buildReminderPreferences,
  generateReminderSchedule,
  isReminderOffset,
  toReminderPayload,
} from "@/lib/reminders/schedule";
import { isEmailConfigured } from "@/lib/server-config";
import { daysBetween, todayInTimeZone } from "@/lib/utils/dates";
import { buildStoragePath, isOwnStoragePath, validateFile } from "@/lib/utils/files";
import { parseAmount } from "@/lib/utils/money";
import { fieldErrorsFrom, firstErrorMessage, uuidSchema } from "@/lib/validations/common";
import {
  renewDocumentSchema,
  saveDocumentInputSchema,
  uploadRequestSchema,
  type DocumentFormValues,
  type RenewDocumentInput,
  type SaveDocumentInput,
  type UploadRequest,
} from "@/lib/validations/document";
import type { ProfileRow } from "@/types/database";
import type { ActionResult, ReminderChannel, ReminderDayPreference, UploadedFileRef } from "@/types/domain";

function reminderChannel(profile: ProfileRow): ReminderChannel {
  return profile.email_notifications && isEmailConfigured() ? "email" : "in_app";
}

/** Completează lista de praguri cu toate valorile (cele lipsă devin dezactivate). */
function normalizePreferences(input: ReadonlyArray<ReminderDayPreference>): ReminderDayPreference[] {
  const enabled = input.filter((p) => p.enabled).map((p) => p.daysBefore);
  return buildReminderPreferences(enabled);
}

function toDocumentPayload(values: DocumentFormValues, file: UploadedFileRef | null, defaultCurrency: string) {
  const amount = parseAmount(values.amount);
  return {
    title: values.title,
    category: values.category,
    issuer: values.issuer,
    notes: values.notes,
    family_member_id: values.familyMemberId,
    issue_date: values.issueDate,
    expiry_date: values.noExpiry ? "" : values.expiryDate,
    currency: amount === null ? "" : values.currency || defaultCurrency,
    amount: amount === null ? "" : String(amount),
    renewal_url: values.renewalUrl,
    file_path: file?.path ?? "",
    file_name: file?.name ?? "",
    file_mime_type: file?.mimeType ?? "",
  };
}

function revalidateDocumentPages(documentId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/documents");
  revalidatePath("/reminders");
  revalidatePath("/family");
  if (documentId) revalidatePath(`/documents/${documentId}`);
}

// ---------------------------------------------------------------------------
// Încărcarea fișierelor
// ---------------------------------------------------------------------------

export interface SignedUpload {
  path: string;
  signedUrl: string;
  mimeType: UploadedFileRef["mimeType"];
}

/**
 * Validează fișierul și emite un URL semnat de încărcare în dosarul utilizatorului.
 * Browserul încarcă apoi direct în Storage (cu progres), fără ca fișierul să treacă prin server.
 */
export async function requestUploadUrl(request: UploadRequest): Promise<ActionResult<SignedUpload>> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;

  const parsed = uploadRequestSchema.safeParse(request);
  if (!parsed.success) return fail("Fișierul nu poate fi încărcat.");

  if (!checkRateLimit("upload", session.user.id).allowed) return fail(RATE_LIMIT_MESSAGE);

  const validation = validateFile(
    { name: parsed.data.fileName, type: parsed.data.mimeType, size: parsed.data.size },
    maxUploadBytes,
  );
  if (!validation.ok) return fail(validation.error);

  const path = buildStoragePath(session.user.id, parsed.data.fileName, crypto.randomUUID());
  const { data, error } = await session.supabase.storage.from(STORAGE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return fail("Nu am putut pregăti încărcarea. Încearcă din nou.");

  return { ok: true, data: { path: data.path, signedUrl: data.signedUrl, mimeType: validation.mimeType } };
}

/** Șterge un fișier încărcat, dar nefolosit (de ex. utilizatorul a renunțat la formular). */
export async function discardUpload(path: string): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;
  if (!isOwnStoragePath(path, session.user.id)) return fail("Fișier invalid.");

  // Nu ștergem un fișier care aparține deja unui document salvat sau istoricului de reînnoiri.
  const [inDocuments, inRenewals] = await Promise.all([
    session.supabase.from("documents").select("id", { count: "exact", head: true }).eq("file_path", path),
    session.supabase.from("renewals").select("id", { count: "exact", head: true }).eq("previous_file_path", path),
  ]);
  if ((inDocuments.count ?? 0) > 0 || (inRenewals.count ?? 0) > 0) return { ok: true, data: undefined };

  await session.supabase.storage.from(STORAGE_BUCKET).remove([path]);
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Salvare / ștergere
// ---------------------------------------------------------------------------

export async function saveDocument(input: SaveDocumentInput): Promise<ActionResult<{ id: string }>> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;

  const parsed = saveDocumentInputSchema.safeParse(input);
  if (!parsed.success) return fail(firstErrorMessage(parsed.error), fieldErrorsFrom(parsed.error));

  const { supabase, user, profile } = session;
  const { documentId, values, file } = parsed.data;

  if (file && !isOwnStoragePath(file.path, user.id)) return fail("Fișierul atașat nu este valid.");

  let previousFilePath: string | null = null;
  if (documentId) {
    const { data: existing, error } = await supabase
      .from("documents")
      .select("id, file_path")
      .eq("id", documentId)
      .maybeSingle();
    if (error) return fail(GENERIC_ERROR);
    if (!existing) return fail("Documentul nu a fost găsit sau nu îți aparține.");
    previousFilePath = existing.file_path;
  }

  const today = todayInTimeZone(profile.timezone);
  const preferences = normalizePreferences(values.reminderDays);
  const planned = generateReminderSchedule({
    documentTitle: values.title,
    expiryDate: values.noExpiry ? null : values.expiryDate,
    preferences,
    today,
    timeZone: profile.timezone,
    channel: reminderChannel(profile),
  });

  const { data: savedId, error } = await supabase.rpc("save_document", {
    p_document_id: documentId,
    p_document: toDocumentPayload(values, file, profile.default_currency),
    p_reminder_days: preferences.map((p) => ({ days_before: p.daysBefore, enabled: p.enabled })),
    p_reminders: toReminderPayload(planned),
  });
  if (error || !savedId) return fail(mapDatabaseError(error));

  // Fișierul vechi a fost înlocuit sau eliminat: îl ștergem din Storage.
  if (previousFilePath && previousFilePath !== file?.path) {
    await supabase.storage.from(STORAGE_BUCKET).remove([previousFilePath]);
  }

  revalidateDocumentPages(savedId);
  return {
    ok: true,
    data: { id: savedId },
    message: documentId ? "Modificările au fost salvate." : "Documentul a fost adăugat.",
  };
}

export async function deleteDocument(documentId: string): Promise<ActionResult> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;
  if (!uuidSchema.safeParse(documentId).success) return fail("Document invalid.");

  const { supabase } = session;
  const [{ data: doc }, { data: renewals }] = await Promise.all([
    supabase.from("documents").select("id, file_path").eq("id", documentId).maybeSingle(),
    supabase.from("renewals").select("previous_file_path").eq("document_id", documentId),
  ]);
  if (!doc) return fail("Documentul nu a fost găsit sau nu îți aparține.");

  const { error } = await supabase.from("documents").delete().eq("id", documentId);
  if (error) return fail(mapDatabaseError(error));

  // Remindere, preferințe, reînnoiri și jurnal se șterg în cascadă. Fișierele le ștergem explicit.
  const files = [doc.file_path, ...(renewals ?? []).map((r) => r.previous_file_path)].filter((path): path is string =>
    Boolean(path),
  );
  if (files.length > 0) await supabase.storage.from(STORAGE_BUCKET).remove(files);

  revalidateDocumentPages();
  return { ok: true, data: undefined, message: "Documentul a fost șters." };
}

// ---------------------------------------------------------------------------
// Reînnoire
// ---------------------------------------------------------------------------

export async function renewDocument(input: RenewDocumentInput): Promise<ActionResult<{ renewalId: string }>> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;

  const parsed = renewDocumentSchema.safeParse(input);
  if (!parsed.success) return fail(firstErrorMessage(parsed.error), fieldErrorsFrom(parsed.error));

  const { supabase, user, profile } = session;
  const { documentId, newExpiryDate, note, file } = parsed.data;
  if (file && !isOwnStoragePath(file.path, user.id)) return fail("Fișierul atașat nu este valid.");

  const today = todayInTimeZone(profile.timezone);
  if (daysBetween(today, newExpiryDate) < 0) {
    return fail("Noua dată de expirare nu poate fi în trecut.", {
      newExpiryDate: ["Noua dată de expirare nu poate fi în trecut."],
    });
  }

  const [{ data: doc }, { data: preferenceRows }] = await Promise.all([
    supabase.from("documents").select("id, title").eq("id", documentId).maybeSingle(),
    supabase.from("reminder_preferences").select("days_before, enabled").eq("document_id", documentId),
  ]);
  if (!doc) return fail("Documentul nu a fost găsit sau nu îți aparține.");

  const preferences =
    preferenceRows && preferenceRows.length > 0
      ? normalizePreferences(
          preferenceRows
            .filter((row) => isReminderOffset(row.days_before))
            .map((row) => ({
              daysBefore: row.days_before as ReminderDayPreference["daysBefore"],
              enabled: row.enabled,
            })),
        )
      : buildReminderPreferences(profile.default_reminder_days);

  const planned = generateReminderSchedule({
    documentTitle: doc.title,
    expiryDate: newExpiryDate,
    preferences,
    today,
    timeZone: profile.timezone,
    channel: reminderChannel(profile),
  });

  const { data: renewalId, error } = await supabase.rpc("renew_document", {
    p_document_id: documentId,
    p_new_expiry_date: newExpiryDate,
    p_note: note || null,
    p_file: file ? { path: file.path, name: file.name, mime_type: file.mimeType } : null,
    p_reminders: toReminderPayload(planned),
  });
  if (error || !renewalId) return fail(mapDatabaseError(error));

  revalidateDocumentPages(documentId);
  return { ok: true, data: { renewalId }, message: "Documentul a fost marcat ca reînnoit." };
}

// ---------------------------------------------------------------------------
// Previzualizare securizată
// ---------------------------------------------------------------------------

/** URL semnat, valabil 5 minute, pentru un fișier propriu (curent sau dintr-o reînnoire anterioară). */
export async function getSignedFileUrl(path: string): Promise<ActionResult<{ url: string }>> {
  const session = await getActionSession();
  if (!session) return NOT_AUTHENTICATED;
  if (!isOwnStoragePath(path, session.user.id)) return fail("Fișier invalid.");

  const { data, error } = await session.supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 300);
  if (error || !data) return fail("Fișierul nu poate fi deschis acum.");
  return { ok: true, data: { url: data.signedUrl } };
}
