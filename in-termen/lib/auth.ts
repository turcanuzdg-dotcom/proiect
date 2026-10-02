import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import { DEFAULT_CURRENCY, DEFAULT_REMINDER_DAYS, DEFAULT_TIMEZONE } from "@/lib/constants";
import { createClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/database";

export interface SessionContext {
  supabase: ServerSupabaseClient;
  user: User;
  profile: ProfileRow;
}

function fallbackProfile(user: User): ProfileRow {
  const now = new Date().toISOString();
  const metaName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
  return {
    id: user.id,
    full_name: metaName,
    timezone: DEFAULT_TIMEZONE,
    locale: "ro-RO",
    default_currency: DEFAULT_CURRENCY,
    default_reminder_days: [...DEFAULT_REMINDER_DAYS],
    in_app_notifications: true,
    email_notifications: false,
    tracked_categories: [],
    onboarding_completed: false,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Utilizatorul curent (validat de serverul Supabase) și profilul lui.
 * Memorat pe durata unei cereri, ca layout-ul și pagina să nu repete interogările.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (profile) return { supabase, user, profile };

  // Profilul lipsește (de ex. trigger-ul nu a rulat): îl creăm acum.
  const created = fallbackProfile(user);
  const { data: inserted } = await supabase
    .from("profiles")
    .upsert({ id: user.id, full_name: created.full_name })
    .select("*")
    .maybeSingle();
  return { supabase, user, profile: inserted ?? created };
});

/** Pentru pagini protejate: redirecționează la /login dacă nu există sesiune. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export function firstName(fullName: string, email?: string | null): string {
  const first = fullName.trim().split(/\s+/)[0];
  if (first) return first;
  return email ? email.split("@")[0] : "";
}
