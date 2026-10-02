import type {
  ActivityAction,
  Currency,
  DocumentCategory,
  DocumentStatus,
  ReminderChannel,
  ReminderOffset,
  ReminderStatus,
} from "@/types/domain";

export const APP_NAME = "În Termen";
export const APP_TAGLINE =
  "Fotografiază sau încarcă un act. Aplicația îți spune ce expiră și când trebuie să acționezi.";

export const DEFAULT_TIMEZONE = "Europe/Chisinau";
export const DEFAULT_LOCALE = "ro-RO";
export const DEFAULT_CURRENCY: Currency = "MDL";
export const DEFAULT_REMINDER_DAYS: ReminderOffset[] = [45, 30, 14, 7, 1];
/** Ora locală la care apar reminderele programate. */
export const REMINDER_HOUR = 9;

/** Pragurile statusurilor, în zile până la expirare (inclusiv). */
export const URGENT_THRESHOLD_DAYS = 7;
export const UPCOMING_THRESHOLD_DAYS = 30;

export const STORAGE_BUCKET = "documents";

/** Cuvântul care trebuie scris pentru „Șterge toate datele mele”. */
export const DELETE_CONFIRMATION_WORD = "ȘTERGE";

export const CATEGORY_META: Record<DocumentCategory, { label: string; description: string }> = {
  personal_documents: {
    label: "Acte personale",
    description: "Buletin, pașaport, permis de conducere, certificate.",
  },
  vehicle: {
    label: "Mașină",
    description: "Revizie tehnică, înmatriculare, vignetă, service.",
  },
  insurance: {
    label: "Asigurări",
    description: "RCA, Carte Verde, CASCO, asigurări de locuință sau de viață.",
  },
  home_warranty: {
    label: "Casă și garanții",
    description: "Garanții pentru electrocasnice, contracte, verificări periodice.",
  },
  bills_subscriptions: {
    label: "Facturi și abonamente",
    description: "Internet, telefon, utilități, abonamente digitale.",
  },
  health: {
    label: "Sănătate",
    description: "Polița medicală, analize periodice, rețete, vaccinări.",
  },
  family: {
    label: "Familie",
    description: "Acte ale copiilor, școală, activități, termene de familie.",
  },
  other: {
    label: "Altele",
    description: "Orice alt termen pe care vrei să nu-l pierzi.",
  },
};

export const STATUS_META: Record<DocumentStatus, { label: string; description: string; filterLabel: string }> = {
  expired: { label: "Expirat", description: "Termenul a trecut", filterLabel: "Expirat" },
  urgent: { label: "Urgent", description: "Expiră în cel mult 7 zile", filterLabel: "Urgent (0–7 zile)" },
  upcoming: { label: "Urmează", description: "Expiră în 8–30 de zile", filterLabel: "Urmează (8–30 de zile)" },
  safe: { label: "În regulă", description: "Mai mult de 30 de zile", filterLabel: "În regulă (peste 30 de zile)" },
  no_expiry: { label: "Fără termen", description: "Nu are dată de expirare", filterLabel: "Fără termen" },
};

export const REMINDER_STATUS_LABELS: Record<ReminderStatus, string> = {
  pending: "Programat",
  snoozed: "Amânat",
  completed: "Rezolvat",
  dismissed: "Închis",
};

export const REMINDER_CHANNEL_LABELS: Record<ReminderChannel, string> = {
  in_app: "În aplicație",
  email: "În aplicație și e-mail",
};

export const REMINDER_OFFSET_LABELS: Record<ReminderOffset, string> = {
  45: "Cu 45 de zile înainte",
  30: "Cu 30 de zile înainte",
  14: "Cu 14 zile înainte",
  7: "Cu 7 zile înainte",
  1: "Cu o zi înainte",
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  MDL: "MDL — leu moldovenesc",
  RON: "RON — leu românesc",
  EUR: "EUR — euro",
};

export const ACTIVITY_LABELS: Record<ActivityAction, string> = {
  created: "Document adăugat",
  updated: "Detalii actualizate",
  renewed: "Marcat ca reînnoit",
  file_uploaded: "Fișier atașat",
  file_removed: "Fișier eliminat",
  reminder_completed: "Reminder rezolvat",
  reminder_snoozed: "Reminder amânat",
  reminder_created: "Reminder adăugat",
};

export const TIMEZONE_OPTIONS = [
  { value: "Europe/Chisinau", label: "Chișinău (Europe/Chisinau)" },
  { value: "Europe/Bucharest", label: "București (Europe/Bucharest)" },
  { value: "Europe/London", label: "Londra (Europe/London)" },
  { value: "Europe/Rome", label: "Roma (Europe/Rome)" },
  { value: "Europe/Berlin", label: "Berlin (Europe/Berlin)" },
  { value: "Europe/Madrid", label: "Madrid (Europe/Madrid)" },
] as const;

export const FAMILY_RELATIONSHIPS = [
  "Partener / parteneră",
  "Copil",
  "Părinte",
  "Frate / soră",
  "Bunic / bunică",
  "Altă rudă",
] as const;
