import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicConfig } from "@/lib/config";
import type { Database } from "@/types/database";

/**
 * Client Supabase pentru Server Components, Server Actions și Route Handlers.
 * Rulează cu sesiunea utilizatorului, deci toate interogările trec prin RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Apelat dintr-un Server Component: sesiunea este reîmprospătată de proxy.ts.
        }
      },
    },
  });
}

export type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
