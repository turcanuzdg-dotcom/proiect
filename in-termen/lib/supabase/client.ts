"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicConfig } from "@/lib/config";
import type { Database } from "@/types/database";

/** Client Supabase pentru browser (cheia publică „anon”; accesul este limitat de RLS). */
export function createClient() {
  return createBrowserClient<Database>(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey);
}
