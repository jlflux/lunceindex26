import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Two clients:
 *  - `publicClient` uses the anon key and can only read (RLS allows select).
 *  - `serviceClient` uses the service role key, bypasses RLS, and must only
 *    ever be constructed in server-side code.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return v;
}

let _public: SupabaseClient | null = null;
export function publicClient(): SupabaseClient {
  if (!_public) {
    _public = createClient(
      required("NEXT_PUBLIC_SUPABASE_URL"),
      required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      { auth: { persistSession: false } },
    );
  }
  return _public;
}

let _service: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("serviceClient() must never be called in the browser");
  }
  if (!_service) {
    _service = createClient(
      required("NEXT_PUBLIC_SUPABASE_URL"),
      required("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
  }
  return _service;
}
