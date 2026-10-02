import "server-only";

import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { toDocumentView, type DocumentView } from "@/lib/data/views";
import type { ISODate } from "@/lib/utils/dates";
import { STATUS_PRIORITY } from "@/lib/utils/status";
import type { ActivityLogRow, FamilyMemberRow, ReminderPreferenceRow, ReminderRow, RenewalRow } from "@/types/database";

const DOCUMENT_SELECT = "*, family_members(id, full_name)";

/** Erorile de citire se transmit mai departe către error.tsx, cu un mesaj în română. */
export class DataError extends Error {
  constructor(message = "Nu am putut încărca datele. Încearcă din nou.") {
    super(message);
    this.name = "DataError";
  }
}

export async function listDocuments(supabase: ServerSupabaseClient, today: ISODate): Promise<DocumentView[]> {
  const { data, error } = await supabase
    .from("documents")
    .select(DOCUMENT_SELECT)
    .is("archived_at", null)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) throw new DataError();
  return (data ?? []).map((row) => toDocumentView(row, today));
}

/** Sortarea „după urgență”: expirate, apoi cele mai apropiate termene, apoi cele fără termen. */
export function sortByUrgency(documents: DocumentView[]): DocumentView[] {
  return [...documents].sort((a, b) => {
    const priority = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (priority !== 0) return priority;
    if (a.daysLeft !== null && b.daysLeft !== null) return a.daysLeft - b.daysLeft;
    return a.title.localeCompare(b.title, "ro");
  });
}

export interface DocumentDetail {
  document: DocumentView;
  preferences: ReminderPreferenceRow[];
  reminders: ReminderRow[];
  renewals: RenewalRow[];
  activity: ActivityLogRow[];
}

export async function getDocumentDetail(
  supabase: ServerSupabaseClient,
  id: string,
  today: ISODate,
): Promise<DocumentDetail | null> {
  const { data: row, error } = await supabase.from("documents").select(DOCUMENT_SELECT).eq("id", id).maybeSingle();
  if (error) throw new DataError();
  if (!row) return null;

  const [preferences, reminders, renewals, activity] = await Promise.all([
    supabase.from("reminder_preferences").select("*").eq("document_id", id).order("days_before", { ascending: false }),
    supabase.from("reminders").select("*").eq("document_id", id).order("remind_at", { ascending: true }),
    supabase.from("renewals").select("*").eq("document_id", id).order("created_at", { ascending: false }),
    supabase
      .from("activity_logs")
      .select("*")
      .eq("document_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (preferences.error || reminders.error || renewals.error || activity.error) throw new DataError();

  return {
    document: toDocumentView(row, today),
    preferences: preferences.data ?? [],
    reminders: reminders.data ?? [],
    renewals: renewals.data ?? [],
    activity: activity.data ?? [],
  };
}

export async function listFamilyMembers(supabase: ServerSupabaseClient): Promise<FamilyMemberRow[]> {
  const { data, error } = await supabase.from("family_members").select("*").order("created_at", { ascending: true });
  if (error) throw new DataError();
  return data ?? [];
}

export type ReminderWithDocument = ReminderRow & {
  documents: { id: string; title: string; category: string; expiry_date: string | null } | null;
};

export async function listReminders(
  supabase: ServerSupabaseClient,
  options: { status: "active" | "completed"; limit?: number },
): Promise<ReminderWithDocument[]> {
  let query = supabase.from("reminders").select("*, documents(id, title, category, expiry_date)");
  if (options.status === "active") {
    query = query.in("status", ["pending", "snoozed"]).order("remind_at", { ascending: true });
  } else {
    query = query.eq("status", "completed").order("completed_at", { ascending: false });
  }
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw new DataError();
  return data ?? [];
}

/** Filtru PostgREST pentru remindere scadente (programate sau amânate, al căror moment a sosit). */
function dueFilter(nowIso: string): string {
  return `and(status.eq.pending,remind_at.lte.${nowIso}),and(status.eq.snoozed,snoozed_until.lte.${nowIso})`;
}

export async function listDueNotifications(
  supabase: ServerSupabaseClient,
  now: Date = new Date(),
): Promise<{ items: ReminderWithDocument[]; unread: number }> {
  const nowIso = now.toISOString();
  const [items, unread] = await Promise.all([
    supabase
      .from("reminders")
      .select("*, documents(id, title, category, expiry_date)")
      .or(dueFilter(nowIso))
      .order("remind_at", { ascending: false })
      .limit(8),
    supabase.from("reminders").select("id", { count: "exact", head: true }).or(dueFilter(nowIso)).is("read_at", null),
  ]);
  return { items: items.data ?? [], unread: unread.count ?? 0 };
}
