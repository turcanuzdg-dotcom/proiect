import type { ReactNode } from "react";
import { ArrowLeft, BellOff, ExternalLink, Mail, Paperclip, Pencil, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CategoryIcon, categoryLabel } from "@/components/documents/category-icon";
import { DeleteDocumentButton } from "@/components/documents/delete-document-button";
import { DocumentTimeline } from "@/components/documents/document-timeline";
import { FilePreview, SignedFileButton } from "@/components/documents/file-preview";
import { RenewDialog } from "@/components/documents/renew-dialog";
import { StatusBadge, STATUS_STYLES } from "@/components/documents/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { STORAGE_BUCKET } from "@/lib/constants";
import { getDocumentDetail } from "@/lib/data/queries";
import { effectiveReminderAt, isActiveReminder } from "@/lib/reminders/schedule";
import { cn } from "@/lib/utils/cn";
import {
  formatDayCount,
  formatExpiryDistance,
  formatRoDate,
  formatRoDateTime,
  shiftISODate,
  todayInTimeZone,
} from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import { UUID_RE } from "@/lib/validations/common";

export const metadata: Metadata = { title: "Detalii document" };

function joinRo(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} și ${parts.at(-1)}`;
}

/** Ex.: „Cu 45, 30, 14 și 7 zile și cu o zi înainte”. */
function reminderSummary(days: number[]): string {
  if (days.length === 0) return "Toate reminderele sunt dezactivate";
  const sorted = [...days].sort((a, b) => b - a);
  const multi = sorted.filter((d) => d !== 1);
  const parts: string[] = [];
  if (multi.length > 0) parts.push(`cu ${joinRo(multi.map(String))} ${(multi.at(-1) ?? 0) >= 20 ? "de zile" : "zile"}`);
  if (sorted.includes(1)) parts.push("cu o zi");
  const text = `${parts.join(" și ")} înainte`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default async function DocumentDetailPage({ params }: PageProps<"/documents/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { supabase, profile } = await requireSession();
  const today = todayInTimeZone(profile.timezone);
  const detail = await getDocumentDetail(supabase, id, today);
  if (!detail) notFound();

  const { document: doc, preferences, reminders, renewals, activity } = detail;
  const style = STATUS_STYLES[doc.status];

  let signedUrl: string | null = null;
  if (doc.file_path) {
    const { data } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(doc.file_path, 300);
    signedUrl = data?.signedUrl ?? null;
  }

  const enabledDays = preferences.filter((p) => p.enabled).map((p) => p.days_before);
  const upcomingReminders = reminders
    .filter(isActiveReminder)
    .sort((a, b) => effectiveReminderAt(a).localeCompare(effectiveReminderAt(b)));
  const suggestedExpiry = shiftISODate(doc.expiry_date && doc.expiry_date > today ? doc.expiry_date : today, 365);

  const details: Array<[string, ReactNode]> = [
    ["Data expirării", doc.expiry_date ? formatRoDate(doc.expiry_date) : "Fără termen"],
    ["Data emiterii", doc.issue_date ? formatRoDate(doc.issue_date) : "—"],
    ["Emitent / furnizor", doc.issuer ?? "—"],
    ["Persoana", doc.memberName ?? "Eu (titularul contului)"],
    ["Sumă", doc.amount !== null ? formatMoney(doc.amount, doc.currency) : "—"],
    ["Categorie", categoryLabel(doc.category)],
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/documents"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 rounded-lg text-sm font-medium"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Documente
      </Link>

      {/* Antet */}
      <section className="border-border bg-surface shadow-card rounded-2xl border p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <CategoryIcon category={doc.category} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-sm">
              {categoryLabel(doc.category)}
              {doc.is_demo ? " · Date demonstrative (fictive)" : ""}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">{doc.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusBadge status={doc.status} size="md" />
              <span
                className={cn(
                  "text-[15px] font-medium",
                  doc.status === "safe" || doc.status === "no_expiry" ? "text-foreground" : style.text,
                )}
              >
                {formatExpiryDistance(doc.daysLeft)}
              </span>
              {doc.expiry_date ? (
                <span className="text-muted-foreground text-[15px]">· {formatRoDate(doc.expiry_date)}</span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="border-border mt-6 flex flex-col gap-2 border-t pt-5 sm:flex-row sm:flex-wrap">
          <RenewDialog
            documentId={doc.id}
            title={doc.title}
            currentExpiryDate={doc.expiry_date}
            suggestedExpiryDate={suggestedExpiry}
          />
          {doc.renewal_url ? (
            <Button asChild variant="outline" size="lg">
              <a href={doc.renewal_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                Deschide linkul de reînnoire
                <span className="sr-only"> (se deschide într-o filă nouă)</span>
              </a>
            </Button>
          ) : null}
          <div className="flex gap-2 sm:ml-auto">
            <Button asChild variant="outline" className="flex-1 sm:flex-none">
              <Link href={`/documents/${doc.id}/edit`}>
                <Pencil aria-hidden />
                Editează
              </Link>
            </Button>
            <DeleteDocumentButton documentId={doc.id} title={doc.title} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Detalii</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {details.map(([label, value]) => (
                  <div key={label} className="border-border flex flex-col gap-0.5 border-b pb-3">
                    <dt className="text-muted-foreground text-[13px]">{label}</dt>
                    <dd className="text-[15px] font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              {doc.notes ? (
                <div className="mt-5">
                  <p className="text-muted-foreground text-[13px]">Notițe</p>
                  <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-line">{doc.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="text-muted-foreground size-4" aria-hidden />
                Fișier
              </CardTitle>
            </CardHeader>
            <CardContent>
              {doc.file_path && doc.file_name ? (
                <FilePreview
                  key={doc.file_path}
                  path={doc.file_path}
                  name={doc.file_name}
                  mimeType={doc.file_mime_type}
                  initialUrl={signedUrl}
                />
              ) : (
                <div className="border-input bg-subtle text-muted-foreground flex flex-col items-start gap-3 rounded-xl border border-dashed p-5 text-sm">
                  Nu există fișier atașat.
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/documents/${doc.id}/edit`}>Atașează un fișier</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {renewals.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Reînnoiri anterioare</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-border flex flex-col divide-y">
                  {renewals.map((renewal) => (
                    <li key={renewal.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                      <p className="text-sm font-medium">
                        {renewal.previous_expiry_date ? formatRoDate(renewal.previous_expiry_date) : "Fără termen"} →{" "}
                        {renewal.new_expiry_date ? formatRoDate(renewal.new_expiry_date) : "Fără termen"}
                      </p>
                      <p className="text-muted-foreground text-[13px]">
                        Reînnoit pe {formatRoDateTime(renewal.created_at, profile.timezone)}
                        {renewal.note ? ` · ${renewal.note}` : ""}
                      </p>
                      {renewal.previous_file_path ? (
                        <div>
                          <SignedFileButton
                            path={renewal.previous_file_path}
                            label={`Fișierul anterior: ${renewal.previous_file_name ?? "deschide"}`}
                          />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Remindere</CardTitle>
              <p className="text-muted-foreground text-[13px]">
                {doc.expiry_date ? reminderSummary(enabledDays) : "Fără termen, deci fără remindere automate"}
              </p>
            </CardHeader>
            <CardContent>
              {upcomingReminders.length === 0 ? (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <BellOff className="size-4" aria-hidden />
                  Niciun reminder programat.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {upcomingReminders.map((reminder) => (
                    <li key={reminder.id} className="border-border rounded-xl border p-3">
                      <p className="text-sm leading-snug font-medium">
                        {reminder.days_before === null
                          ? reminder.title
                          : reminder.days_before === 1
                            ? "Cu o zi înainte"
                            : `Cu ${formatDayCount(reminder.days_before)} înainte`}
                      </p>
                      <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 text-[13px]">
                        <time dateTime={effectiveReminderAt(reminder)}>
                          {formatRoDateTime(effectiveReminderAt(reminder), profile.timezone)}
                        </time>
                        <span className="inline-flex items-center gap-1">
                          {reminder.channel === "email" ? (
                            <Mail className="size-3" aria-hidden />
                          ) : (
                            <Smartphone className="size-3" aria-hidden />
                          )}
                          {reminder.channel === "email" ? "Aplicație + e-mail" : "În aplicație"}
                        </span>
                        {reminder.status === "snoozed" ? <span>· amânat</span> : null}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {doc.expiry_date &&
              doc.daysLeft !== null &&
              enabledDays.length > 0 &&
              doc.daysLeft > Math.max(...enabledDays) ? (
                <p className="text-muted-foreground mt-4 text-[13px]">
                  Primul reminder vine cu {formatDayCount(Math.max(...enabledDays))} înainte de termen.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Istoric</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentTimeline entries={activity} timeZone={profile.timezone} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
