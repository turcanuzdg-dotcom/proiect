import type { Metadata } from "next";

import { DocumentForm } from "@/components/documents/document-form";
import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth";
import { listFamilyMembers } from "@/lib/data/queries";
import { buildReminderPreferences } from "@/lib/reminders/schedule";
import { isCurrency } from "@/lib/utils/money";
import type { DocumentFormValues } from "@/lib/validations/document";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@/types/domain";

export const metadata: Metadata = { title: "Adaugă un document" };

export default async function NewDocumentPage({ searchParams }: PageProps<"/documents/new">) {
  const { supabase, profile } = await requireSession();
  const params = await searchParams;
  const familyMembers = await listFamilyMembers(supabase);

  const requestedCategory = typeof params.categorie === "string" ? params.categorie : "";
  const requestedMember = typeof params.persoana === "string" ? params.persoana : "";
  const defaultValues: Omit<DocumentFormValues, "category"> & { category?: DocumentCategory } = {
    title: "",
    category: (DOCUMENT_CATEGORIES as readonly string[]).includes(requestedCategory)
      ? (requestedCategory as DocumentCategory)
      : undefined,
    issuer: "",
    familyMemberId: familyMembers.some((m) => m.id === requestedMember) ? requestedMember : "",
    notes: "",
    currency: isCurrency(profile.default_currency) ? profile.default_currency : "MDL",
    amount: "",
    renewalUrl: "",
    issueDate: "",
    noExpiry: false,
    expiryDate: "",
    reminderDays: buildReminderPreferences(profile.default_reminder_days),
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Adaugă un document" description="Cinci pași scurți. Poți sări peste ce nu știi acum." />
      <DocumentForm
        mode="create"
        defaultValues={defaultValues}
        initialFile={null}
        familyMembers={familyMembers.map(({ id, full_name }) => ({ id, full_name }))}
        timeZone={profile.timezone}
        preferredCategories={profile.tracked_categories}
        cancelHref="/documents"
      />
    </div>
  );
}
