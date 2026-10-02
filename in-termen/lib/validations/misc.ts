import { z } from "zod";

import { TIMEZONE_OPTIONS } from "@/lib/constants";
import { isoDateSchema, optionalIsoDateSchema, uuidSchema } from "@/lib/validations/common";
import { CURRENCIES, DOCUMENT_CATEGORIES, REMINDER_CHANNELS, REMINDER_OFFSETS } from "@/types/domain";

// ---------------------------------------------------------------------------
// Familie
// ---------------------------------------------------------------------------

export const familyMemberSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Scrie numele persoanei.")
    .max(120, "Numele poate avea cel mult 120 de caractere."),
  relationship: z.string().trim().max(60, "Cel mult 60 de caractere."),
  birthDate: optionalIsoDateSchema,
});

export type FamilyMemberValues = z.infer<typeof familyMemberSchema>;

export const saveFamilyMemberInputSchema = z.object({
  memberId: uuidSchema.nullable(),
  values: familyMemberSchema,
});

// ---------------------------------------------------------------------------
// Remindere
// ---------------------------------------------------------------------------

export const manualReminderSchema = z.object({
  title: z.string().trim().min(1, "Scrie ce vrei să-ți amintim.").max(160, "Cel mult 160 de caractere."),
  body: z.string().trim().max(1000, "Cel mult 1000 de caractere."),
  date: isoDateSchema,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Ora trebuie să fie în formatul HH:MM."),
  channel: z.enum(REMINDER_CHANNELS),
});

export type ManualReminderValues = z.infer<typeof manualReminderSchema>;

export const snoozeReminderSchema = z.object({
  reminderId: uuidSchema,
  option: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("days"), days: z.literal([1, 3, 7]) }),
    z.object({ kind: z.literal("date"), date: isoDateSchema }),
  ]),
});

export type SnoozeReminderInput = z.infer<typeof snoozeReminderSchema>;

// ---------------------------------------------------------------------------
// Setări și onboarding
// ---------------------------------------------------------------------------

const timezoneValues = TIMEZONE_OPTIONS.map((option) => option.value) as [string, ...string[]];

export const profileSettingsSchema = z.object({
  fullName: z.string().trim().min(1, "Scrie numele tău.").max(120, "Numele poate avea cel mult 120 de caractere."),
  timezone: z.enum(timezoneValues, { error: "Alege un fus orar din listă." }),
  defaultCurrency: z.enum(CURRENCIES),
  defaultReminderDays: z.array(z.literal(REMINDER_OFFSETS)).max(REMINDER_OFFSETS.length),
});

export type ProfileSettingsValues = z.infer<typeof profileSettingsSchema>;

export const notificationSettingsSchema = z.object({
  inAppNotifications: z.boolean(),
  emailNotifications: z.boolean(),
});

export const onboardingSchema = z.object({
  categories: z.array(z.enum(DOCUMENT_CATEGORIES)).max(DOCUMENT_CATEGORIES.length),
  emailNotifications: z.boolean(),
  addDemoData: z.boolean(),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;

// ---------------------------------------------------------------------------
// Autentificare
// ---------------------------------------------------------------------------

const emailSchema = z
  .string()
  .trim()
  .min(1, "Scrie adresa de e-mail.")
  .pipe(z.email("Adresa de e-mail nu pare corectă."));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Scrie parola."),
});

const newPasswordSchema = z
  .string()
  .min(8, "Parola trebuie să aibă cel puțin 8 caractere.")
  .max(72, "Parola poate avea cel mult 72 de caractere.");

export const signupSchema = z.object({
  fullName: z.string().trim().min(1, "Scrie cum te numești.").max(120, "Numele poate avea cel mult 120 de caractere."),
  email: emailSchema,
  password: newPasswordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: newPasswordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Parolele nu coincid.",
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
