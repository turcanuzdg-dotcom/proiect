import { UPCOMING_THRESHOLD_DAYS, URGENT_THRESHOLD_DAYS } from "@/lib/constants";
import { daysUntilExpiry, type ISODate } from "@/lib/utils/dates";
import type { DocumentStatus } from "@/types/domain";

/**
 * Statusul unui document după data expirării:
 * - expired: înainte de astăzi
 * - urgent: de astăzi până în 7 zile
 * - upcoming: 8–30 de zile
 * - safe: peste 30 de zile
 * - no_expiry: fără dată de expirare
 */
export function getDocumentStatus(expiryDate: ISODate | null | undefined, today: ISODate): DocumentStatus {
  const days = daysUntilExpiry(expiryDate, today);
  return statusFromDays(days);
}

export function statusFromDays(days: number | null): DocumentStatus {
  if (days === null) return "no_expiry";
  if (days < 0) return "expired";
  if (days <= URGENT_THRESHOLD_DAYS) return "urgent";
  if (days <= UPCOMING_THRESHOLD_DAYS) return "upcoming";
  return "safe";
}

/** Ordinea de urgență, pentru sortare (cele mai urgente primele). */
export const STATUS_PRIORITY: Record<DocumentStatus, number> = {
  expired: 0,
  urgent: 1,
  upcoming: 2,
  safe: 3,
  no_expiry: 4,
};

export function needsAttention(status: DocumentStatus): boolean {
  return status === "expired" || status === "urgent" || status === "upcoming";
}

export type StatusSummary = Record<DocumentStatus, number> & { total: number };

export function summarizeStatuses(
  documents: ReadonlyArray<{ expiry_date: ISODate | null }>,
  today: ISODate,
): StatusSummary {
  const summary: StatusSummary = { expired: 0, urgent: 0, upcoming: 0, safe: 0, no_expiry: 0, total: 0 };
  for (const doc of documents) {
    summary[getDocumentStatus(doc.expiry_date, today)] += 1;
    summary.total += 1;
  }
  return summary;
}
