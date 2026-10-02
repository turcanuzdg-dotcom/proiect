import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicConfig } from "@/lib/config";
import { serverConfig } from "@/lib/server-config";
import type { Database } from "@/types/database";

/**
 * Client cu cheia service-role: OCOLEȘTE RLS. Se folosește doar în joburi de server
 * (de ex. /api/cron/reminders) și niciodată cu date venite direct de la utilizator.
 */
export function createAdminClient() {
  if (!serverConfig.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nu este configurată.");
  }
  return createClient<Database>(publicConfig.supabaseUrl, serverConfig.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
