import { DEFAULT_REMINDER_DAYS, DEFAULT_TIMEZONE, REMINDER_HOUR } from "@/lib/constants";
import {
  daysBetween,
  formatDayCount,
  formatRoDate,
  isoDateInTimeZone,
  shiftISODate,
  todayInTimeZone,
  zonedDateTimeToUtcISO,
  type ISODate,
} from "@/lib/utils/dates";
import {
  REMINDER_OFFSETS,
  type ReminderChannel,
  type ReminderDayPreference,
  type ReminderOffset,
  type ReminderStatus,
} from "@/types/domain";

export interface PlannedReminder {
  title: string;
  body: string;
  /** Momentul reminderului, ISO UTC. */
  remindAt: string;
  /** Data locală a reminderului (YYYY-MM-DD). */
  remindOn: ISODate;
  channel: ReminderChannel;
  /** null pentru reminderul de recuperare (când pragurile au trecut deja). */
  daysBefore: number | null;
  kind: "scheduled" | "catch_up";
}

export interface ReminderScheduleInput {
  documentTitle: string;
  expiryDate: ISODate | null;
  preferences: ReadonlyArray<ReminderDayPreference>;
  today: ISODate;
  timeZone?: string;
  channel?: ReminderChannel;
  hour?: number;
}

/** Preferințele implicite pentru un document nou, pornind de la setările utilizatorului. */
export function buildReminderPreferences(
  enabledDays: ReadonlyArray<number> = DEFAULT_REMINDER_DAYS,
): ReminderDayPreference[] {
  return REMINDER_OFFSETS.map((daysBefore) => ({ daysBefore, enabled: enabledDays.includes(daysBefore) }));
}

export function isReminderOffset(value: number): value is ReminderOffset {
  return (REMINDER_OFFSETS as readonly number[]).includes(value);
}

function scheduledTitle(documentTitle: string, daysBefore: number): string {
  if (daysBefore === 1) return `${documentTitle} expiră mâine`;
  return `${documentTitle} expiră în ${formatDayCount(daysBefore)}`;
}

/**
 * Generează reminderele pentru un document.
 *
 * Reguli:
 * - un reminder pentru fiecare prag activ (45/30/14/7/1 zile), la ora locală REMINDER_HOUR;
 * - pragurile care au trecut deja nu se programează retroactiv;
 * - dacă cel puțin un prag activ a fost sărit și nu există deja un reminder astăzi,
 *   se adaugă un singur reminder „de recuperare” astăzi (inclusiv pentru documentele expirate);
 * - fără dată de expirare sau fără praguri active: niciun reminder.
 */
export function generateReminderSchedule(input: ReminderScheduleInput): PlannedReminder[] {
  const { documentTitle, expiryDate, preferences, today } = input;
  const timeZone = input.timeZone ?? DEFAULT_TIMEZONE;
  const channel = input.channel ?? "in_app";
  const hour = input.hour ?? REMINDER_HOUR;

  if (!expiryDate) return [];

  const enabledOffsets = Array.from(new Set(preferences.filter((p) => p.enabled).map((p) => p.daysBefore))).sort(
    (a, b) => b - a,
  );
  if (enabledOffsets.length === 0) return [];

  const expiryLabel = formatRoDate(expiryDate);
  const planned: PlannedReminder[] = [];
  let skipped = false;

  for (const daysBefore of enabledOffsets) {
    const remindOn = shiftISODate(expiryDate, -daysBefore);
    if (daysBetween(today, remindOn) < 0) {
      skipped = true;
      continue;
    }
    planned.push({
      title: scheduledTitle(documentTitle, daysBefore),
      body: `Data expirării: ${expiryLabel}. Verifică termenul și pregătește reînnoirea din timp.`,
      remindAt: zonedDateTimeToUtcISO(remindOn, hour, timeZone),
      remindOn,
      channel,
      daysBefore,
      kind: "scheduled",
    });
  }

  const hasReminderToday = planned.some((r) => r.remindOn === today);
  if (skipped && !hasReminderToday) {
    const daysLeft = daysBetween(today, expiryDate);
    const expired = daysLeft < 0;
    // Data exactă (nu „în N zile”), ca titlul să rămână corect și dacă reminderul este amânat.
    let title: string;
    if (expired) title = `Termen depășit: ${documentTitle}`;
    else if (daysLeft === 0) title = `${documentTitle} expiră astăzi`;
    else title = `${documentTitle} expiră pe ${expiryLabel}`;

    planned.push({
      title,
      body: expired
        ? `Termenul a fost pe ${expiryLabel}. Verifică ce pași trebuie făcuți.`
        : `Data expirării: ${expiryLabel}. Verifică termenul cât mai curând.`,
      remindAt: zonedDateTimeToUtcISO(today, hour, timeZone),
      remindOn: today,
      channel,
      daysBefore: null,
      kind: "catch_up",
    });
  }

  return planned.sort((a, b) => a.remindAt.localeCompare(b.remindAt));
}

/** Primul reminder care va apărea (sau null). */
export function firstUpcomingReminder(planned: ReadonlyArray<PlannedReminder>): PlannedReminder | null {
  return planned.length === 0 ? null : planned.reduce((a, b) => (a.remindAt <= b.remindAt ? a : b));
}

/** Forma acceptată de funcțiile SQL (save_document / renew_document). */
export function toReminderPayload(planned: ReadonlyArray<PlannedReminder>) {
  return planned.map((r) => ({
    title: r.title,
    body: r.body,
    remind_at: r.remindAt,
    channel: r.channel,
    days_before: r.daysBefore,
  }));
}

// ---------------------------------------------------------------------------
// Afișarea și gruparea reminderelor existente
// ---------------------------------------------------------------------------

export interface ReminderLike {
  remind_at: string;
  snoozed_until: string | null;
  status: string;
}

/** Momentul efectiv: data amânării, dacă există, altfel data programată. */
export function effectiveReminderAt(reminder: Pick<ReminderLike, "remind_at" | "snoozed_until">): string {
  return reminder.snoozed_until ?? reminder.remind_at;
}

export function isActiveReminder(reminder: Pick<ReminderLike, "status">): boolean {
  const status = reminder.status as ReminderStatus;
  return status === "pending" || status === "snoozed";
}

/** Un reminder activ este „scadent” când momentul lui efectiv a sosit. */
export function isReminderDue(reminder: ReminderLike, now: Date = new Date()): boolean {
  return isActiveReminder(reminder) && new Date(effectiveReminderAt(reminder)).getTime() <= now.getTime();
}

export type ReminderGroupKey = "today" | "next7" | "next30" | "later";

export const REMINDER_GROUP_LABELS: Record<ReminderGroupKey, string> = {
  today: "Astăzi",
  next7: "În următoarele 7 zile",
  next30: "În următoarele 30 de zile",
  later: "Mai târziu",
};

/** Grupa unui reminder; cele restante (din zilele trecute) intră la „Astăzi”. */
export function reminderGroupFor(
  reminder: Pick<ReminderLike, "remind_at" | "snoozed_until">,
  today: ISODate,
  timeZone: string = DEFAULT_TIMEZONE,
): ReminderGroupKey {
  const day = isoDateInTimeZone(effectiveReminderAt(reminder), timeZone);
  const diff = daysBetween(today, day);
  if (diff <= 0) return "today";
  if (diff <= 7) return "next7";
  if (diff <= 30) return "next30";
  return "later";
}

export function groupReminders<T extends ReminderLike>(
  reminders: ReadonlyArray<T>,
  today: ISODate,
  timeZone: string = DEFAULT_TIMEZONE,
): Record<ReminderGroupKey, T[]> {
  const groups: Record<ReminderGroupKey, T[]> = { today: [], next7: [], next30: [], later: [] };
  const sorted = [...reminders]
    .filter(isActiveReminder)
    .sort((a, b) => effectiveReminderAt(a).localeCompare(effectiveReminderAt(b)));
  for (const reminder of sorted) {
    groups[reminderGroupFor(reminder, today, timeZone)].push(reminder);
  }
  return groups;
}

export type SnoozeOption = { kind: "days"; days: 1 | 3 | 7 } | { kind: "date"; date: ISODate };

/** Noul moment al unui reminder amânat: data aleasă (sau peste N zile), la ora reminderelor. */
export function computeSnoozeUntil(
  option: SnoozeOption,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
  hour: number = REMINDER_HOUR,
): string {
  const today = todayInTimeZone(timeZone, now);
  const target = option.kind === "days" ? shiftISODate(today, option.days) : option.date;
  return zonedDateTimeToUtcISO(target, hour, timeZone);
}
