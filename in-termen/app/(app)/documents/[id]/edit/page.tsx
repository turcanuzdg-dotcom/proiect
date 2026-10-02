import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentForm } from "@/components/documents/document-form";
import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth";
import { getDocumentDetail, listFamilyMembers } from "@/lib/data/queries";
import { buildReminderPreferences } from "@/lib/reminders/schedule";
import { todayInTimeZone } from "@/lib/utils/dates";
import { isAllowedMimeType } from "@/lib/utils/files";
import { isCurrency } from "@/lib/utils/money";
import { UUID_RE } from "@/lib/validations/common";
import type { DocumentFormValues } from "@/lib/validations/document";

export const metadata: Metadata = { title: "Editează documentul" };

export default async function EditDocumentPage({ params }: PageProps<"/documents/[id]/edit">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { supabase, profile } = await requireSession();
  const [detail, familyMembers] = await Promise.all([
    getDocumentDetail(supabase, id, todayInTimeZone(profile.timezone)),
    listFamilyMembers(supabase),
  ]);
  if (!detail) notFound();

  const { document: doc, preferences } = detail;
  const enabledDays =
    preferences.length > 0
      ? preferences.filter((p) => p.enabled).map((p) => p.days_before)
      : profile.default_reminder_days;

  const defaultValues: DocumentFormValues = {
    title: doc.title,
    category: doc.category,
    issuer: doc.issuer ?? "",
    familyMemberId: doc.family_member_id ?? "",
    notes: doc.notes ?? "",
    currency: isCurrency(doc.currency)
      ? doc.currency
      : isCurrency(profile.default_currency)
        ? profile.default_currency
        : "MDL",
    amount: doc.amount !== null ? String(doc.amount).replace(".", ",") : "",
    renewalUrl: doc.renewal_url ?? "",
    issueDate: doc.issue_date ?? "",
    noExpiry: doc.expiry_date === null,
    expiryDate: doc.expiry_date ?? "",
    reminderDays: buildReminderPreferences(enabledDays),
  };

  const initialFile =
    doc.file_path && doc.file_name && doc.file_mime_type && isAllowedMimeType(doc.file_mime_type)
      ? { path: doc.file_path, name: doc.file_name, mimeType: doc.file_mime_type }
      : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editează documentul" description={doc.title} />
      <DocumentForm
        mode="edit"
        documentId={doc.id}
        defaultValues={defaultValues}
        initialFile={initialFile}
        familyMembers={familyMembers.map(({ id: memberId, full_name }) => ({ id: memberId, full_name }))}
        timeZone={profile.timezone}
        preferredCategories={profile.tracked_categories}
        cancelHref={`/documents/${doc.id}`}
      />
    </div>
  );
}
