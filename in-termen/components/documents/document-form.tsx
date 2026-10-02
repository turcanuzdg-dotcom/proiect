"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, BellRing, Check, LoaderCircle, Paperclip } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";

import { CategoryIcon, categoryLabel } from "@/components/documents/category-icon";
import { CategoryPicker } from "@/components/documents/category-picker";
import { FileUploader } from "@/components/documents/file-uploader";
import { OcrAssistant } from "@/components/documents/ocr-assistant";
import { ReminderToggles } from "@/components/documents/reminder-toggles";
import { StatusBadge } from "@/components/documents/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { describedBy, Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { saveDocument } from "@/lib/actions/documents";
import { CURRENCY_LABELS } from "@/lib/constants";
import { firstUpcomingReminder, generateReminderSchedule } from "@/lib/reminders/schedule";
import { cn } from "@/lib/utils/cn";
import {
  daysUntilExpiry,
  formatExpiryDistance,
  formatRoDate,
  formatRoDateTime,
  isISODate,
  todayInTimeZone,
} from "@/lib/utils/dates";
import { formatMoney, parseAmount } from "@/lib/utils/money";
import { getDocumentStatus } from "@/lib/utils/status";
import { documentFormSchema, type DocumentFormValues } from "@/lib/validations/document";
import { CURRENCIES, type ReminderDayPreference, type UploadedFileRef } from "@/types/domain";

type StepKey = "category" | "details" | "dates" | "file" | "review";

const STEPS: Array<{
  key: StepKey;
  label: string;
  title: string;
  description: string;
  fields: FieldPath<DocumentFormValues>[];
}> = [
  {
    key: "category",
    label: "Categorie",
    title: "Ce fel de document este?",
    description: "Alege categoria potrivită. O poți schimba oricând.",
    fields: ["category"],
  },
  {
    key: "details",
    label: "Informații",
    title: "Informații de bază",
    description: "Doar titlul este obligatoriu. Restul te ajută să găsești documentul mai ușor.",
    fields: ["title", "issuer", "familyMemberId", "notes", "currency", "amount", "renewalUrl"],
  },
  {
    key: "dates",
    label: "Termene",
    title: "Date importante",
    description: "Data expirării stabilește statusul și reminderele.",
    fields: ["issueDate", "expiryDate", "noExpiry", "reminderDays"],
  },
  {
    key: "file",
    label: "Fișier",
    title: "Atașează documentul",
    description: "Opțional: o poză sau un PDF, ca să-l ai la îndemână când ai nevoie.",
    fields: [],
  },
  {
    key: "review",
    label: "Verificare",
    title: "Verifică și salvează",
    description: "Un ultim control înainte de salvare.",
    fields: [],
  },
];

interface DocumentFormProps {
  mode: "create" | "edit";
  documentId?: string;
  /** Categoria lipsește la un document nou, până o alege utilizatorul. */
  defaultValues: Omit<DocumentFormValues, "category"> & { category?: DocumentFormValues["category"] };
  initialFile: UploadedFileRef | null;
  familyMembers: Array<{ id: string; full_name: string }>;
  timeZone: string;
  cancelHref: string;
  preferredCategories?: ReadonlyArray<string>;
}

export function DocumentForm({
  mode,
  documentId,
  defaultValues,
  initialFile,
  familyMembers,
  timeZone,
  cancelHref,
  preferredCategories,
}: DocumentFormProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(mode === "edit" ? 1 : 0);
  const [visited, setVisited] = useState<number>(mode === "edit" ? STEPS.length - 1 : 0);
  const [file, setFile] = useState<UploadedFileRef | null>(initialFile);
  const [uploading, setUploading] = useState(false);
  const [saving, startSaving] = useTransition();
  const [today] = useState(() => todayInTimeZone(timeZone));

  const form = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
    defaultValues,
    mode: "onTouched",
  });
  const { register, control, formState, setValue, trigger, handleSubmit, setError } = form;
  const { errors } = formState;
  const values = useWatch({ control });

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const expiryForPreview = values.noExpiry
    ? null
    : values.expiryDate && isISODate(values.expiryDate)
      ? values.expiryDate
      : null;

  const planned = useMemo(
    () =>
      generateReminderSchedule({
        documentTitle: values.title || "Document",
        expiryDate: expiryForPreview,
        preferences: (values.reminderDays ?? []).filter(
          (p): p is ReminderDayPreference => p?.daysBefore !== undefined && p.enabled !== undefined,
        ),
        today,
        timeZone,
      }),
    [values.title, values.reminderDays, expiryForPreview, today, timeZone],
  );
  const firstReminder = firstUpcomingReminder(planned);

  function goTo(index: number) {
    setStepIndex(index);
    setVisited((v) => Math.max(v, index));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function next() {
    const valid = step.fields.length === 0 ? true : await trigger(step.fields, { shouldFocus: true });
    if (valid) goTo(Math.min(stepIndex + 1, STEPS.length - 1));
  }

  function onInvalid(fieldErrors: typeof errors) {
    const failing = STEPS.findIndex((s) => s.fields.some((f) => f in fieldErrors));
    if (failing !== -1) goTo(failing);
    toast.error("Verifică câmpurile marcate.");
  }

  const submit = handleSubmit((data) => {
    if (uploading) {
      toast.error("Așteaptă să se termine încărcarea fișierului.");
      return;
    }
    startSaving(async () => {
      const result = await saveDocument({ documentId: documentId ?? null, values: data, file });
      if (!result.ok) {
        for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
          const field = key.replace(/^values\./, "") as FieldPath<DocumentFormValues>;
          setError(field, { message: messages[0] });
        }
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Document salvat.");
      router.push(`/documents/${result.data.id}`);
      router.refresh();
    });
  }, onInvalid);

  const amountNumber = parseAmount(values.amount ?? "");
  const previewStatus = getDocumentStatus(expiryForPreview, today);

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate className="flex flex-col gap-6">
      {/* Pașii */}
      <nav aria-label="Pașii formularului">
        <p className="text-muted-foreground mb-3 text-sm sm:hidden">
          Pasul {stepIndex + 1} din {STEPS.length} · <span className="text-foreground font-medium">{step.label}</span>
        </p>
        <div className="bg-muted h-1.5 overflow-hidden rounded-full sm:hidden" aria-hidden>
          <div
            className="bg-primary h-full rounded-full transition-[width] duration-300"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <ol className="hidden items-center gap-2 sm:flex">
          {STEPS.map((s, index) => {
            const done = index < stepIndex;
            const current = index === stepIndex;
            const reachable = index <= visited;
            return (
              <li key={s.key} className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => reachable && goTo(index)}
                  disabled={!reachable}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg py-1 pr-2 text-sm font-medium transition-colors",
                    current
                      ? "text-foreground"
                      : reachable
                        ? "text-muted-foreground hover:text-foreground"
                        : "text-muted-foreground/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                      current && "bg-primary text-primary-foreground",
                      done && "bg-accent-soft text-accent",
                      !current && !done && "border-input bg-surface border",
                    )}
                  >
                    {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : index + 1}
                  </span>
                  {s.label}
                </button>
                {index < STEPS.length - 1 ? <span className="bg-border h-px flex-1" aria-hidden /> : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <section
        aria-labelledby="pas-titlu"
        className="border-border bg-surface shadow-card rounded-2xl border p-5 sm:p-7"
      >
        <header className="mb-6">
          <h2 id="pas-titlu" className="text-lg font-semibold tracking-tight">
            {step.title}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">{step.description}</p>
        </header>

        {step.key === "category" ? (
          <Controller
            control={control}
            name="category"
            render={({ field, fieldState }) => (
              <CategoryPicker
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
                preferred={preferredCategories}
              />
            )}
          />
        ) : null}

        {step.key === "details" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="title" label="Titlul documentului" error={errors.title?.message} className="sm:col-span-2">
              <Input
                id="title"
                placeholder="de ex. RCA automobil, Pașaport, Garanție frigider"
                autoComplete="off"
                aria-invalid={Boolean(errors.title)}
                aria-describedby={describedBy("title", errors.title?.message)}
                {...register("title")}
              />
            </Field>
            <Field id="issuer" label="Emitent / furnizor" optional error={errors.issuer?.message}>
              <Input
                id="issuer"
                placeholder="de ex. compania de asigurări"
                aria-invalid={Boolean(errors.issuer)}
                aria-describedby={describedBy("issuer", errors.issuer?.message)}
                {...register("issuer")}
              />
            </Field>
            <Field
              id="familyMemberId"
              label="Persoana"
              optional
              hint={
                familyMembers.length === 0 ? (
                  <>
                    Poți adăuga membri ai familiei în{" "}
                    <Link href="/family" className="text-primary font-medium hover:underline">
                      Familie
                    </Link>
                    .
                  </>
                ) : (
                  "Al cui este documentul."
                )
              }
            >
              <NativeSelect id="familyMemberId" aria-describedby="familyMemberId-hint" {...register("familyMemberId")}>
                <option value="">Eu (titularul contului)</option>
                {familyMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="amount" label="Cost sau sumă recurentă" optional error={errors.amount?.message}>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="de ex. 250"
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={describedBy("amount", errors.amount?.message)}
                {...register("amount")}
              />
            </Field>
            <Field id="currency" label="Monedă" optional>
              <NativeSelect id="currency" {...register("currency")}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {CURRENCY_LABELS[code]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              id="renewalUrl"
              label="Link pentru reînnoire"
              optional
              error={errors.renewalUrl?.message}
              hint="Pagina unde faci reînnoirea sau plata."
              className="sm:col-span-2"
            >
              <Input
                id="renewalUrl"
                type="url"
                inputMode="url"
                placeholder="https://"
                aria-invalid={Boolean(errors.renewalUrl)}
                aria-describedby={describedBy("renewalUrl", errors.renewalUrl?.message, true)}
                {...register("renewalUrl")}
              />
            </Field>
            <Field id="notes" label="Notițe" optional error={errors.notes?.message} className="sm:col-span-2">
              <Textarea
                id="notes"
                rows={3}
                placeholder="de ex. ce acte trebuie pregătite pentru reînnoire"
                aria-invalid={Boolean(errors.notes)}
                aria-describedby={describedBy("notes", errors.notes?.message)}
                {...register("notes")}
              />
            </Field>
          </div>
        ) : null}

        {step.key === "dates" ? (
          <div className="flex flex-col gap-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="issueDate" label="Data emiterii" optional error={errors.issueDate?.message}>
                <Input
                  id="issueDate"
                  type="date"
                  aria-invalid={Boolean(errors.issueDate)}
                  aria-describedby={describedBy("issueDate", errors.issueDate?.message)}
                  {...register("issueDate")}
                />
              </Field>
              <Field
                id="expiryDate"
                label="Data expirării"
                error={errors.expiryDate?.message}
                hint={
                  expiryForPreview
                    ? `${formatRoDate(expiryForPreview)} · ${formatExpiryDistance(daysUntilExpiry(expiryForPreview, today))}`
                    : undefined
                }
              >
                <Input
                  id="expiryDate"
                  type="date"
                  disabled={values.noExpiry}
                  aria-invalid={Boolean(errors.expiryDate)}
                  aria-describedby={describedBy("expiryDate", errors.expiryDate?.message, Boolean(expiryForPreview))}
                  {...register("expiryDate")}
                />
              </Field>
            </div>

            <div className="bg-subtle flex items-start gap-3 rounded-xl p-4">
              <Controller
                control={control}
                name="noExpiry"
                render={({ field }) => (
                  <Checkbox
                    id="noExpiry"
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked === true);
                      if (checked === true) void trigger("expiryDate");
                    }}
                  />
                )}
              />
              <Label htmlFor="noExpiry" className="cursor-pointer leading-snug font-normal">
                <span className="font-medium">Documentul nu are termen de expirare</span>
                <span className="text-muted-foreground mt-0.5 block text-[13px]">
                  De exemplu chitanțe, contracte fără termen, abonamente sau documente de arhivă.
                </span>
              </Label>
            </div>

            <div>
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <BellRing className="text-accent size-4" aria-hidden />
                Remindere
              </h3>
              <p className="text-muted-foreground mb-3 text-[13px]">
                Alege când vrei să-ți amintim. Pragurile care au trecut deja nu se programează; în locul lor primești un
                singur reminder astăzi.
              </p>
              <Controller
                control={control}
                name="reminderDays"
                render={({ field }) => (
                  <ReminderToggles
                    value={field.value}
                    onChange={field.onChange}
                    expiryDate={expiryForPreview}
                    today={today}
                    disabled={values.noExpiry}
                  />
                )}
              />
            </div>
          </div>
        ) : null}

        {step.key === "file" ? (
          <div className="flex flex-col gap-5">
            <FileUploader
              value={file}
              onChange={setFile}
              savedPath={initialFile?.path ?? null}
              onUploadingChange={setUploading}
            />
            <div className="border-border flex flex-col gap-2 rounded-xl border p-4">
              <p className="text-sm font-medium">Completare automată</p>
              <p className="text-muted-foreground text-[13px]">
                Poți încerca extragerea datelor din document. Verifică întotdeauna rezultatul.
              </p>
              <div className="mt-1">
                <OcrAssistant
                  file={file}
                  values={{
                    title: values.title ?? "",
                    category: values.category ?? "",
                    issuer: values.issuer ?? "",
                    issueDate: values.issueDate ?? "",
                    expiryDate: values.noExpiry ? "" : (values.expiryDate ?? ""),
                  }}
                  onApplyExpiryDate={(date) => {
                    setValue("noExpiry", false);
                    setValue("expiryDate", date, { shouldValidate: true, shouldDirty: true });
                    toast.success(`Data expirării a fost completată: ${formatRoDate(date)}. Verific-o.`);
                  }}
                />
              </div>
            </div>
            {!file ? (
              <p className="text-muted-foreground text-[13px]">
                Nu ai fișierul la îndemână? Poți sări peste acest pas și îl adaugi mai târziu.
              </p>
            ) : null}
          </div>
        ) : null}

        {step.key === "review" ? (
          <div className="flex flex-col gap-5">
            <div className="border-border bg-subtle flex items-start gap-4 rounded-2xl border p-4">
              <CategoryIcon category={values.category ?? "other"} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-[13px]">{categoryLabel(values.category ?? "other")}</p>
                <p className="mt-0.5 text-lg leading-snug font-semibold">{values.title || "Fără titlu"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={previewStatus} />
                  <span className="text-muted-foreground text-[13px]">
                    {formatExpiryDistance(daysUntilExpiry(expiryForPreview, today))}
                  </span>
                </div>
              </div>
            </div>

            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <ReviewRow
                label="Data expirării"
                value={expiryForPreview ? formatRoDate(expiryForPreview) : "Fără termen"}
              />
              <ReviewRow
                label="Data emiterii"
                value={values.issueDate && isISODate(values.issueDate) ? formatRoDate(values.issueDate) : "—"}
              />
              <ReviewRow label="Emitent / furnizor" value={values.issuer || "—"} />
              <ReviewRow
                label="Persoana"
                value={
                  familyMembers.find((m) => m.id === values.familyMemberId)?.full_name ?? "Eu (titularul contului)"
                }
              />
              <ReviewRow
                label="Sumă"
                value={amountNumber !== null ? formatMoney(amountNumber, values.currency || undefined) : "—"}
              />
              <ReviewRow
                label="Fișier"
                value={
                  file ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Paperclip className="size-3.5" aria-hidden />
                      {file.name}
                    </span>
                  ) : (
                    "Fără fișier"
                  )
                }
              />
            </dl>

            {expiryForPreview ? (
              firstReminder ? (
                <Notice tone="info" title="Primul reminder">
                  {formatRoDateTime(firstReminder.remindAt, timeZone)}
                  {firstReminder.remindOn === today ? " (astăzi)" : ""} — {firstReminder.title}. În total:{" "}
                  {planned.length} {planned.length === 1 ? "reminder" : "remindere"} în aplicație.
                </Notice>
              ) : (
                <Notice tone="neutral" title="Niciun reminder programat">
                  Ai dezactivat toate reminderele pentru acest document.
                </Notice>
              )
            ) : (
              <Notice tone="neutral" title="Fără remindere">
                Documentele fără termen de expirare nu primesc remindere automate. Poți adăuga oricând un reminder
                manual.
              </Notice>
            )}
          </div>
        ) : null}
      </section>

      {/* Navigare */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        {stepIndex > 0 ? (
          <Button variant="outline" size="lg" onClick={() => goTo(stepIndex - 1)}>
            <ArrowLeft aria-hidden />
            Înapoi
          </Button>
        ) : (
          <Button asChild variant="ghost" size="lg">
            <Link href={cancelHref}>Renunță</Link>
          </Button>
        )}
        <div className="flex flex-col-reverse gap-3 sm:ml-auto sm:flex-row">
          {mode === "edit" && !isLast ? (
            <Button variant="outline" size="lg" onClick={submit} disabled={saving || uploading}>
              Salvează modificările
            </Button>
          ) : null}
          {isLast ? (
            <Button size="lg" onClick={submit} disabled={saving || uploading} aria-busy={saving}>
              {saving ? <LoaderCircle className="animate-spin" aria-hidden /> : <Check aria-hidden />}
              {saving ? "Se salvează…" : mode === "edit" ? "Salvează modificările" : "Salvează documentul"}
            </Button>
          ) : (
            <Button size="lg" onClick={next} disabled={uploading}>
              {step.key === "file" && !file ? "Continuă fără fișier" : "Continuă"}
              <ArrowRight aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function ReviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-border flex flex-col gap-0.5 border-b pb-3">
      <dt className="text-muted-foreground text-[13px]">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
