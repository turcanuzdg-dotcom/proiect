"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { describedBy, Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileSettings } from "@/lib/actions/settings";
import { CURRENCY_LABELS, REMINDER_OFFSET_LABELS, TIMEZONE_OPTIONS } from "@/lib/constants";
import { profileSettingsSchema, type ProfileSettingsValues } from "@/lib/validations/misc";
import { CURRENCIES, REMINDER_OFFSETS } from "@/types/domain";

export function ProfileForm({ defaults, email }: { defaults: ProfileSettingsValues; email: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, control, handleSubmit, formState, reset } = useForm<ProfileSettingsValues>({
    resolver: zodResolver(profileSettingsSchema),
    defaultValues: defaults,
  });
  const { errors, isDirty } = formState;

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateProfileSettings(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Salvat.");
      reset(values);
      router.refresh();
    });
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="s-name" label="Nume" error={errors.fullName?.message}>
          <Input
            id="s-name"
            autoComplete="name"
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={describedBy("s-name", errors.fullName?.message)}
            {...register("fullName")}
          />
        </Field>
        <Field id="s-email" label="E-mail" hint="Adresa de autentificare nu poate fi schimbată aici.">
          <Input id="s-email" value={email} readOnly disabled aria-describedby="s-email-hint" />
        </Field>
        <Field id="s-language" label="Limba" hint="Aplicația este disponibilă deocamdată în română.">
          <NativeSelect
            id="s-language"
            value="ro-RO"
            disabled
            aria-describedby="s-language-hint"
            onChange={() => undefined}
          >
            <option value="ro-RO">Română</option>
          </NativeSelect>
        </Field>
        <Field
          id="s-timezone"
          label="Fus orar"
          error={errors.timezone?.message}
          hint="Stabilește ce înseamnă „astăzi” și ora reminderelor."
        >
          <NativeSelect id="s-timezone" aria-describedby="s-timezone-hint" {...register("timezone")}>
            {TIMEZONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="s-currency" label="Moneda implicită">
          <NativeSelect id="s-currency" {...register("defaultCurrency")}>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {CURRENCY_LABELS[code]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Remindere implicite pentru documentele noi</legend>
        <p className="text-muted-foreground mt-1 text-[13px]">Le poți ajusta separat pentru fiecare document.</p>
        <Controller
          control={control}
          name="defaultReminderDays"
          render={({ field }) => (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {REMINDER_OFFSETS.map((offset) => {
                const checked = field.value.includes(offset);
                const id = `s-rem-${offset}`;
                return (
                  <div key={offset} className="border-border flex items-center gap-3 rounded-xl border px-3 py-2.5">
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(next) =>
                        field.onChange(
                          next === true
                            ? [...field.value, offset].sort((a, b) => b - a)
                            : field.value.filter((value) => value !== offset),
                        )
                      }
                    />
                    <Label htmlFor={id} className="cursor-pointer font-normal">
                      {REMINDER_OFFSET_LABELS[offset]}
                    </Label>
                  </div>
                );
              })}
            </div>
          )}
        />
      </fieldset>

      <div>
        <Button type="submit" disabled={pending || !isDirty}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          Salvează preferințele
        </Button>
      </div>
    </form>
  );
}
