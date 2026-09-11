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
      `${name} is not set. On Vercel: Settings → Environment Variables, ` +
        `then redeploy (new variables only apply to a fresh deployment). ` +
        `Locally: add it to .env.local — see .env.example.`,
    );
  }
  return v;
}

/**
 * Reduces the project URL to scheme + host.
 *
 * supabase-js appends `/rest/v1/<table>` itself, so anything already on the
 * path is duplicated: a URL ending in `/rest/v1` produces
 * `/rest/v1/rest/v1/games`, and a doubled slash produces `//rest/v1/games`.
 * Both come back from the API gateway as "Invalid path specified in request
 * URL", which says nothing about the actual cause. Easy to paste in by
 * accident, so normalize rather than fail.
 */
export function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL is not a valid URL (got "${trimmed}"). ` +
        `It should look like https://your-project.supabase.co — ` +
        `Supabase → Project Settings → API → Project URL.`,
    );
  }

  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL must use https (got "${parsed.protocol}//").`,
    );
  }

  return `${parsed.protocol}//${parsed.host}`;
}

/** Host only, for diagnostics. Never includes credentials. */
export function supabaseHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return normalizeSupabaseUrl(raw);
  } catch {
    return raw.trim();
  }
}

let _public: SupabaseClient | null = null;
export function publicClient(): SupabaseClient {
  if (!_public) {
    _public = createClient(
      normalizeSupabaseUrl(required("NEXT_PUBLIC_SUPABASE_URL")),
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
      normalizeSupabaseUrl(required("NEXT_PUBLIC_SUPABASE_URL")),
      required("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
  }
  return _service;
}
