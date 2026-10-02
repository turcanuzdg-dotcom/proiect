import { buildReminderPreferences, generateReminderSchedule, toReminderPayload } from "@/lib/reminders/schedule";
import { shiftISODate, type ISODate } from "@/lib/utils/dates";
import type { DocumentCategory, ReminderChannel } from "@/types/domain";

/**
 * Datele demonstrative. Toate sunt FICTIVE și marcate cu is_demo = true în baza de date,
 * ca să poată fi șterse dintr-un singur clic din Setări.
 */

export const DEMO_NOTE = "Exemplu fictiv — date demonstrative.";

interface DemoDocumentSpec {
  title: string;
  category: DocumentCategory;
  /** Zile față de astăzi; null = fără termen. */
  expiresInDays: number | null;
  issuer?: string;
  amount?: number;
  assignToFamilyMember?: boolean;
  notes?: string;
}

export const DEMO_FAMILY_MEMBER = {
  full_name: "Ana Popescu",
  relationship: "Copil",
  birth_date: "",
} as const;

export const DEMO_DOCUMENTS: DemoDocumentSpec[] = [
  {
    title: "RCA automobil",
    category: "insurance",
    expiresInDays: 12,
    issuer: "Asigurări Exemplu (fictiv)",
    amount: 1150,
  },
  { title: "Pașaport", category: "personal_documents", expiresInDays: 95, assignToFamilyMember: true },
  {
    title: "Revizie tehnică automobil",
    category: "vehicle",
    expiresInDays: 6,
    issuer: "Centru tehnic exemplu (fictiv)",
  },
  {
    title: "Garanție frigider",
    category: "home_warranty",
    expiresInDays: 240,
    issuer: "Magazin Exemplu (fictiv)",
    amount: 8999,
  },
  {
    title: "Abonament internet",
    category: "bills_subscriptions",
    expiresInDays: null,
    issuer: "Furnizor internet exemplu (fictiv)",
    amount: 250,
    notes: `${DEMO_NOTE} Plată lunară recurentă.`,
  },
  { title: "Carte de identitate", category: "personal_documents", expiresInDays: 480 },
  { title: "Verificare anuală detector fum", category: "home_warranty", expiresInDays: -5 },
];

export function buildDemoPayload(options: {
  today: ISODate;
  timeZone: string;
  channel: ReminderChannel;
  currency: string;
  reminderDays: ReadonlyArray<number>;
}) {
  const preferences = buildReminderPreferences(options.reminderDays.length > 0 ? options.reminderDays : undefined);

  const documents = DEMO_DOCUMENTS.map((spec) => {
    const expiryDate = spec.expiresInDays === null ? null : shiftISODate(options.today, spec.expiresInDays);
    const planned = generateReminderSchedule({
      documentTitle: spec.title,
      expiryDate,
      preferences,
      today: options.today,
      timeZone: options.timeZone,
      channel: options.channel,
    });
    return {
      document: {
        title: spec.title,
        category: spec.category,
        issuer: spec.issuer ?? "",
        notes: spec.notes ?? DEMO_NOTE,
        issue_date: "",
        expiry_date: expiryDate ?? "",
        currency: spec.amount ? options.currency : "",
        amount: spec.amount ? String(spec.amount) : "",
        renewal_url: "",
        family_member_id: "",
        file_path: "",
        file_name: "",
        file_mime_type: "",
      },
      reminder_days: preferences.map((p) => ({ days_before: p.daysBefore, enabled: p.enabled })),
      reminders: toReminderPayload(planned),
      assign_to_family_member: Boolean(spec.assignToFamilyMember),
    };
  });

  return { familyMember: DEMO_FAMILY_MEMBER, documents };
}
