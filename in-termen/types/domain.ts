export const DOCUMENT_CATEGORIES = [
  "personal_documents",
  "vehicle",
  "insurance",
  "home_warranty",
  "bills_subscriptions",
  "health",
  "family",
  "other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_STATUSES = ["expired", "urgent", "upcoming", "safe", "no_expiry"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const REMINDER_STATUSES = ["pending", "snoozed", "completed", "dismissed"] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REMINDER_CHANNELS = ["in_app", "email"] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export const CURRENCIES = ["MDL", "RON", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const REMINDER_OFFSETS = [45, 30, 14, 7, 1] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

export const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const ACTIVITY_ACTIONS = [
  "created",
  "updated",
  "renewed",
  "file_uploaded",
  "file_removed",
  "reminder_completed",
  "reminder_snoozed",
  "reminder_created",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export interface ReminderDayPreference {
  daysBefore: ReminderOffset;
  enabled: boolean;
}

export interface UploadedFileRef {
  path: string;
  name: string;
  mimeType: AllowedMimeType;
}

/** Rezultatul standard al unei acțiuni de server. */
export type ActionResult<T = undefined> =
  { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
