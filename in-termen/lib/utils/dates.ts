import { TZDate } from "@date-fns/tz";
import { addDays, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import { ro } from "date-fns/locale";

import { DEFAULT_TIMEZONE } from "@/lib/constants";

/** O dată calendaristică fără oră, în format YYYY-MM-DD. */
export type ISODate = string;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = parseISO(value);
  return isValid(parsed) && format(parsed, "yyyy-MM-dd") === value;
}

/** Data de „astăzi” în fusul orar dat (implicit Europe/Chisinau). */
export function todayInTimeZone(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): ISODate {
  return format(new TZDate(now.getTime(), timeZone), "yyyy-MM-dd");
}

/** Data calendaristică a unui moment (timestamp) într-un fus orar. */
export function isoDateInTimeZone(instant: string | Date, timeZone: string = DEFAULT_TIMEZONE): ISODate {
  const time = typeof instant === "string" ? new Date(instant).getTime() : instant.getTime();
  return format(new TZDate(time, timeZone), "yyyy-MM-dd");
}

/** Adaugă (sau scade, pentru valori negative) zile la o dată calendaristică. */
export function shiftISODate(date: ISODate, days: number): ISODate {
  return format(addDays(parseISO(date), days), "yyyy-MM-dd");
}

/** Câte zile calendaristice sunt de la `today` până la `target` (negativ dacă a trecut). */
export function daysBetween(today: ISODate, target: ISODate): number {
  return differenceInCalendarDays(parseISO(target), parseISO(today));
}

/** Zile până la expirare; null pentru documentele fără termen. */
export function daysUntilExpiry(expiryDate: ISODate | null | undefined, today: ISODate): number | null {
  if (!expiryDate) return null;
  return daysBetween(today, expiryDate);
}

/**
 * Transformă „data D, ora H, în fusul orar Z” într-un timestamp UTC ISO.
 * Ține cont de trecerea la ora de vară/iarnă.
 */
export function zonedDateTimeToUtcISO(
  date: ISODate,
  hour: number,
  timeZone: string = DEFAULT_TIMEZONE,
  minute = 0,
): string {
  const [year, month, day] = date.split("-").map(Number);
  const zoned = new TZDate(year, month - 1, day, hour, minute, 0, 0, timeZone);
  return new Date(zoned.getTime()).toISOString();
}

function toDate(value: ISODate | Date): Date {
  return typeof value === "string" ? parseISO(value) : value;
}

/** Ex.: „3 octombrie 2026”. */
export function formatRoDate(value: ISODate | Date): string {
  return format(toDate(value), "d MMMM yyyy", { locale: ro });
}

/** Ex.: „3 oct.”. */
export function formatRoShortDate(value: ISODate | Date): string {
  return format(toDate(value), "d MMM", { locale: ro });
}

/** Ex.: „3 octombrie 2026, 09:00” (ora locală în fusul orar dat). */
export function formatRoDateTime(instant: string | Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const time = typeof instant === "string" ? new Date(instant).getTime() : instant.getTime();
  return format(new TZDate(time, timeZone), "d MMMM yyyy, HH:mm", { locale: ro });
}

/** Ex.: „sâmbătă, 3 octombrie”. */
export function formatRoWeekdayDate(value: ISODate | Date): string {
  return format(toDate(value), "EEEE, d MMMM", { locale: ro });
}

/**
 * Acordul numeralului cu „zi” în limba română:
 * 1 zi, 2–19 zile, 20+ „de zile” (dar 101–119 fără „de”).
 */
export function formatDayCount(count: number): string {
  const n = Math.abs(Math.trunc(count));
  if (n === 1) return "o zi";
  const lastTwo = n % 100;
  if (n !== 0 && (lastTwo === 0 || lastTwo >= 20)) return `${n} de zile`;
  return `${n} zile`;
}

/** Text scurt pentru termen: „Expiră astăzi”, „Expiră în 12 zile”, „Expirat de 5 zile”. */
export function formatExpiryDistance(days: number | null): string {
  if (days === null) return "Fără termen de expirare";
  if (days === 0) return "Expiră astăzi";
  if (days === 1) return "Expiră mâine";
  if (days > 1) return `Expiră în ${formatDayCount(days)}`;
  if (days === -1) return "Expirat de ieri";
  return `Expirat de ${formatDayCount(days)}`;
}

/** Salut potrivit orei locale. */
export function greetingForHour(hour: number): string {
  if (hour < 5) return "Bună seara";
  if (hour < 12) return "Bună dimineața";
  if (hour < 18) return "Bună ziua";
  return "Bună seara";
}

export function currentHourInTimeZone(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): number {
  return new TZDate(now.getTime(), timeZone).getHours();
}
