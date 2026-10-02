"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { fail, GENERIC_ERROR } from "@/lib/actions/context";
import { publicConfig } from "@/lib/config";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, firstErrorMessage } from "@/lib/validations/common";
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
import type { ActionResult } from "@/types/domain";

async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  return origin || publicConfig.siteUrl;
}

/** Acceptă doar căi relative din aplicație (protecție împotriva redirecționărilor deschise). */
function safeNextPath(next: string | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  return "/dashboard";
}

export async function login(values: LoginValues, next?: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) return fail(firstErrorMessage(parsed.error), fieldErrorsFrom(parsed.error));

  if (!checkRateLimit("auth", `login:${await clientKey()}:${parsed.data.email.toLowerCase()}`).allowed) {
    return fail(RATE_LIMIT_MESSAGE);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return fail("Confirmă adresa de e-mail din mesajul primit, apoi autentifică-te.");
    }
    return fail("E-mailul sau parola nu sunt corecte.");
  }

  redirect(safeNextPath(next));
}

export async function signup(values: SignupValues): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const parsed = signupSchema.safeParse(values);
  if (!parsed.success) return fail(firstErrorMessage(parsed.error), fieldErrorsFrom(parsed.error));

  if (!checkRateLimit("auth", `signup:${await clientKey()}:${parsed.data.email.toLowerCase()}`).allowed) {
    return fail(RATE_LIMIT_MESSAGE);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=/onboarding`,
    },
  });

  if (error) {
    if (error.code === "user_already_exists")
      return fail("Există deja un cont cu acest e-mail. Încearcă să te autentifici.");
    if (error.code === "weak_password")
      return fail("Parola este prea slabă. Folosește cel puțin 8 caractere, cu litere și cifre.");
    return fail(GENERIC_ERROR);
  }

  // Cu confirmarea e-mailului activă, Supabase nu întoarce sesiune până la confirmare.
  if (!data.session) return { ok: true, data: { needsConfirmation: true } };

  redirect("/onboarding");
}

export async function requestPasswordReset(values: ForgotPasswordValues): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) return fail(firstErrorMessage(parsed.error), fieldErrorsFrom(parsed.error));

  if (!checkRateLimit("auth", `reset:${await clientKey()}:${parsed.data.email.toLowerCase()}`).allowed) {
    return fail(RATE_LIMIT_MESSAGE);
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/reset-password`,
  });

  // Același răspuns indiferent dacă adresa există, ca să nu dezvăluim conturile.
  return {
    ok: true,
    data: undefined,
    message: "Dacă există un cont cu această adresă, vei primi în câteva minute un link de resetare.",
  };
}

export async function updatePassword(values: ResetPasswordValues): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(values);
  if (!parsed.success) return fail(firstErrorMessage(parsed.error), fieldErrorsFrom(parsed.error));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Linkul de resetare a expirat. Cere unul nou.");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return fail("Noua parolă trebuie să fie diferită de cea veche.");
    return fail(GENERIC_ERROR);
  }

  redirect("/dashboard?parola=actualizata");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
