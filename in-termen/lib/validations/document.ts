import { z } from "zod";

import { parseAmount } from "@/lib/utils/money";
import { isHttpUrl, isoDateSchema, optionalIsoDateSchema, uuidSchema } from "@/lib/validations/common";
import { ALLOWED_MIME_TYPES, CURRENCIES, DOCUMENT_CATEGORIES, REMINDER_OFFSETS } from "@/types/domain";

export const reminderDaySchema = z.object({
  daysBefore: z.literal(REMINDER_OFFSETS),
  enabled: z.boolean(),
});

export const documentFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Scrie un titlu pentru document.")
      .max(120, "Titlul poate avea cel mult 120 de caractere."),
    category: z.enum(DOCUMENT_CATEGORIES, { error: "Alege o categorie." }),
    issuer: z.string().trim().max(120, "Cel mult 120 de caractere."),
    familyMemberId: z
      .string()
      .refine((value) => value === "" || uuidSchema.safeParse(value).success, "Persoana aleasă nu este validă."),
    notes: z.string().trim().max(2000, "Notițele pot avea cel mult 2000 de caractere."),
    currency: z.union([z.enum(CURRENCIES), z.literal("")]),
    amount: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || parseAmount(value) !== null,
        "Scrie suma ca număr, de exemplu 250 sau 250,50.",
      ),
    renewalUrl: z
      .string()
      .trim()
      .max(500, "Adresa este prea lungă.")
      .refine(
        (value) => value === "" || isHttpUrl(value),
        "Adresa trebuie să fie un link valid, de exemplu https://exemplu.md.",
      ),
    issueDate: optionalIsoDateSchema,
    noExpiry: z.boolean(),
    expiryDate: optionalIsoDateSchema,
    reminderDays: z.array(reminderDaySchema).max(REMINDER_OFFSETS.length),
  })
  .superRefine((values, ctx) => {
    if (!values.noExpiry && values.expiryDate === "") {
      ctx.addIssue({
        code: "custom",
        path: ["expiryDate"],
        message: "Alege data expirării sau bifează „Documentul nu are termen de expirare”.",
      });
    }
    if (!values.noExpiry && values.issueDate && values.expiryDate && values.issueDate > values.expiryDate) {
      ctx.addIssue({
        code: "custom",
        path: ["issueDate"],
        message: "Data emiterii nu poate fi după data expirării.",
      });
    }
  });

export type DocumentFormValues = z.infer<typeof documentFormSchema>;

export const uploadedFileSchema = z.object({
  path: z.string().min(1).max(300),
  name: z.string().trim().min(1).max(200),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
});

export const saveDocumentInputSchema = z.object({
  documentId: uuidSchema.nullable(),
  values: documentFormSchema,
  /** Fișierul final al documentului (null = fără fișier). */
  file: uploadedFileSchema.nullable(),
});

export type SaveDocumentInput = z.infer<typeof saveDocumentInputSchema>;

export const renewDocumentSchema = z.object({
  documentId: uuidSchema,
  newExpiryDate: isoDateSchema,
  note: z.string().trim().max(500, "Nota poate avea cel mult 500 de caractere."),
  file: uploadedFileSchema.nullable(),
});

export type RenewDocumentInput = z.infer<typeof renewDocumentSchema>;

export const uploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().max(100),
  size: z.number().int().positive(),
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export const documentFiltersSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  category: z.union([z.enum(DOCUMENT_CATEGORIES), z.literal("all")]).catch("all"),
  status: z.enum(["all", "expired", "urgent", "upcoming", "safe", "no_expiry"]).catch("all"),
  sort: z.enum(["expiry", "newest", "category", "title"]).catch("expiry"),
  view: z.enum(["grid", "list"]).catch("grid"),
});

export type DocumentFilters = z.infer<typeof documentFiltersSchema>;
