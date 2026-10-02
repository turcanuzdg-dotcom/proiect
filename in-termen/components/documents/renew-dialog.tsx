"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FileUploader } from "@/components/documents/file-uploader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { discardUpload, renewDocument } from "@/lib/actions/documents";
import { formatRoDate, isISODate } from "@/lib/utils/dates";
import { isoDateSchema } from "@/lib/validations/common";
import type { UploadedFileRef } from "@/types/domain";

const renewFormSchema = z.object({
  newExpiryDate: isoDateSchema,
  note: z.string().trim().max(500, "Nota poate avea cel mult 500 de caractere."),
});
type RenewFormValues = z.infer<typeof renewFormSchema>;

interface RenewDialogProps {
  documentId: string;
  title: string;
  currentExpiryDate: string | null;
  suggestedExpiryDate: string;
}

export function RenewDialog({ documentId, title, currentExpiryDate, suggestedExpiryDate }: RenewDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<UploadedFileRef | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<RenewFormValues>({
    resolver: zodResolver(renewFormSchema),
    defaultValues: { newExpiryDate: suggestedExpiryDate, note: "" },
  });
  const { register, handleSubmit, formState, setError, reset, control } = form;
  const newDate = useWatch({ control, name: "newExpiryDate" });

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (!next && file) void discardUpload(file.path);
    if (!next) {
      setFile(null);
      reset({ newExpiryDate: suggestedExpiryDate, note: "" });
    }
    setOpen(next);
  }

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await renewDocument({ documentId, ...values, file });
      if (!result.ok) {
        if (result.fieldErrors?.newExpiryDate)
          setError("newExpiryDate", { message: result.fieldErrors.newExpiryDate[0] });
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Documentul a fost marcat ca reînnoit.");
      setFile(null);
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg">
          <RefreshCcw aria-hidden />
          Marchează ca reînnoit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marchează ca reînnoit</DialogTitle>
          <DialogDescription>
            „{title}” primește un termen nou. Istoricul și fișierul anterior se păstrează, iar reminderele se
            recalculează.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <Field
            id="newExpiryDate"
            label="Noua dată de expirare"
            error={formState.errors.newExpiryDate?.message}
            hint={
              currentExpiryDate
                ? `Termenul anterior: ${formatRoDate(currentExpiryDate)}${newDate && isISODate(newDate) ? ` → ${formatRoDate(newDate)}` : ""}`
                : undefined
            }
          >
            <Input
              id="newExpiryDate"
              type="date"
              aria-invalid={Boolean(formState.errors.newExpiryDate)}
              aria-describedby={describedBy(
                "newExpiryDate",
                formState.errors.newExpiryDate?.message,
                Boolean(currentExpiryDate),
              )}
              {...register("newExpiryDate")}
            />
          </Field>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              Documentul nou <span className="text-muted-foreground font-normal">(opțional)</span>
            </p>
            <FileUploader value={file} onChange={setFile} onUploadingChange={setUploading} />
          </div>
          <Field id="note" label="Notă" optional error={formState.errors.note?.message}>
            <Textarea id="note" rows={2} placeholder="de ex. reînnoit la același asigurător" {...register("note")} />
          </Field>
          <DialogFooter className="mt-0">
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
              Renunță
            </Button>
            <Button type="submit" disabled={pending || uploading} aria-busy={pending}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {pending ? "Se salvează…" : "Confirmă reînnoirea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
