"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm, type FieldValues, type Path, type UseFormSetError } from "react-hook-form";

import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { describedBy, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { login, requestPasswordReset, signup, updatePassword } from "@/lib/actions/auth";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  type ForgotPasswordValues,
  type LoginValues,
  type ResetPasswordValues,
  type SignupValues,
} from "@/lib/validations/misc";

function applyFieldErrors<T extends FieldValues>(
  fieldErrors: Record<string, string[]> | undefined,
  setError: UseFormSetError<T>,
) {
  for (const [key, messages] of Object.entries(fieldErrors ?? {})) {
    setError(key as Path<T>, { message: messages[0] });
  }
}

function SubmitButton({
  pending,
  children,
  pendingLabel,
}: {
  pending: boolean;
  children: string;
  pendingLabel: string;
}) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending} aria-busy={pending}>
      {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {pending ? pendingLabel : children}
    </Button>
  );
}

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setFormError] = useState<string | null>(initialError ?? null);
  const { register, handleSubmit, formState, setError } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors } = formState;

  const submit = handleSubmit((values) =>
    startTransition(async () => {
      setFormError(null);
      const result = await login(values, next);
      if (result && !result.ok) {
        applyFieldErrors(result.fieldErrors, setError);
        setFormError(result.error);
      }
    }),
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field id="email" label="E-mail" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy("email", errors.email?.message)}
          {...register("email")}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <Field id="password" label="Parola" error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={describedBy("password", errors.password?.message)}
            {...register("password")}
          />
        </Field>
        <Link href="/forgot-password" className="text-primary w-fit text-sm font-medium hover:underline">
          Ai uitat parola?
        </Link>
      </div>
      <SubmitButton pending={pending} pendingLabel="Se verifică…">
        Intră în cont
      </SubmitButton>
    </form>
  );
}

export function SignupForm() {
  const [pending, startTransition] = useTransition();
  const [error, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { register, handleSubmit, formState, setError } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });
  const { errors } = formState;

  const submit = handleSubmit((values) =>
    startTransition(async () => {
      setFormError(null);
      const result = await signup(values);
      if (!result) return;
      if (!result.ok) {
        applyFieldErrors(result.fieldErrors, setError);
        setFormError(result.error);
        return;
      }
      if (result.data.needsConfirmation) setSentTo(values.email);
    }),
  );

  if (sentTo) {
    return (
      <div className="flex flex-col items-center text-center">
        <span className="bg-accent-soft text-accent flex size-12 items-center justify-center rounded-2xl" aria-hidden>
          <MailCheck className="size-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Verifică-ți e-mailul</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Ți-am trimis un link de confirmare la <span className="text-foreground font-medium">{sentTo}</span>. După
          confirmare, te ducem direct la configurarea contului.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field id="fullName" label="Nume și prenume" error={errors.fullName?.message}>
        <Input
          id="fullName"
          autoComplete="name"
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={describedBy("fullName", errors.fullName?.message)}
          {...register("fullName")}
        />
      </Field>
      <Field id="email" label="E-mail" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy("email", errors.email?.message)}
          {...register("email")}
        />
      </Field>
      <Field id="password" label="Parola" error={errors.password?.message} hint="Cel puțin 8 caractere.">
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={describedBy("password", errors.password?.message, true)}
          {...register("password")}
        />
      </Field>
      <SubmitButton pending={pending} pendingLabel="Se creează contul…">
        Creează contul
      </SubmitButton>
      <p className="text-muted-foreground text-center text-[13px] leading-relaxed">
        Datele tale sunt folosite doar pentru a-ți aminti de termene. Le poți exporta sau șterge oricând.
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const { errors } = formState;

  const submit = handleSubmit((values) =>
    startTransition(async () => {
      setFormError(null);
      const result = await requestPasswordReset(values);
      if (result.ok) setMessage(result.message ?? "Verifică-ți e-mailul.");
      else setFormError(result.error);
    }),
  );

  if (message)
    return (
      <Notice tone="info" title="Verifică-ți e-mailul">
        {message}
      </Notice>
    );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field id="email" label="E-mail" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy("email", errors.email?.message)}
          {...register("email")}
        />
      </Field>
      <SubmitButton pending={pending} pendingLabel="Se trimite…">
        Trimite linkul de resetare
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [error, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState, setError } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const { errors } = formState;

  const submit = handleSubmit((values) =>
    startTransition(async () => {
      setFormError(null);
      const result = await updatePassword(values);
      if (result && !result.ok) {
        applyFieldErrors(result.fieldErrors, setError);
        setFormError(result.error);
      }
    }),
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field id="password" label="Parola nouă" error={errors.password?.message} hint="Cel puțin 8 caractere.">
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={describedBy("password", errors.password?.message, true)}
          {...register("password")}
        />
      </Field>
      <Field id="confirmPassword" label="Confirmă parola" error={errors.confirmPassword?.message}>
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirmPassword)}
          aria-describedby={describedBy("confirmPassword", errors.confirmPassword?.message)}
          {...register("confirmPassword")}
        />
      </Field>
      <SubmitButton pending={pending} pendingLabel="Se salvează…">
        Salvează parola
      </SubmitButton>
    </form>
  );
}
