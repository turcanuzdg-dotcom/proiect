"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { createManualReminder } from "@/lib/actions/reminders";
import { manualReminderSchema, type ManualReminderValues } from "@/lib/validations/misc";

export function ManualReminderDialog({ today, emailConfigured }: { today: string; emailConfigured: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const defaults: ManualReminderValues = { title: "", body: "", date: today, time: "09:00", channel: "in_app" };
  const { register, handleSubmit, formState, reset, setError } = useForm<ManualReminderValues>({
    resolver: zodResolver(manualReminderSchema),
    defaultValues: defaults,
  });
  const { errors } = formState;

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createManualReminder(values);
      if (!result.ok) {
        for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
          setError(key as keyof ManualReminderValues, { message: messages[0] });
        }
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Reminderul a fost adăugat.");
      reset(defaults);
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          Adaugă un reminder
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reminder nou</DialogTitle>
          <DialogDescription>
            Pentru orice termen care nu ține de un document: o plată, o programare, un apel.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field id="r-title" label="Ce vrei să-ți amintim?" error={errors.title?.message}>
            <Input
              id="r-title"
              placeholder="de ex. Plata impozitului pe bunuri imobiliare"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={describedBy("r-title", errors.title?.message)}
              {...register("title")}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="r-date" label="Data" error={errors.date?.message}>
              <Input id="r-date" type="date" min={today} aria-invalid={Boolean(errors.date)} {...register("date")} />
            </Field>
            <Field id="r-time" label="Ora" error={errors.time?.message}>
              <Input id="r-time" type="time" aria-invalid={Boolean(errors.time)} {...register("time")} />
            </Field>
          </div>
          <Field id="r-body" label="Detalii" optional error={errors.body?.message}>
            <Textarea id="r-body" rows={2} {...register("body")} />
          </Field>
          <Field
            id="r-channel"
            label="Cum vrei să primești reminderul?"
            hint={emailConfigured ? undefined : "Notificările prin e-mail nu sunt configurate încă."}
          >
            <NativeSelect
              id="r-channel"
              aria-describedby={emailConfigured ? undefined : "r-channel-hint"}
              {...register("channel")}
            >
              <option value="in_app">În aplicație</option>
              <option value="email" disabled={!emailConfigured}>
                În aplicație și prin e-mail
              </option>
            </NativeSelect>
          </Field>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Renunță
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              Salvează reminderul
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
