import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "./auth";

/**
 * Guard for admin API routes. Middleware only covers page navigations, so
 * every mutating route checks the session itself.
 *
 * Returns null when authorised, or the response to send when not.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "ADMIN_SESSION_SECRET is not configured." },
      { status: 500 },
    );
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (await verifySession(token, secret)) return null;

  return NextResponse.json({ error: "Not signed in." }, { status: 401 });
}

/** Wraps a handler so it only runs for a signed-in admin. */
export function withAdmin<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
) {
  return async (...args: T): Promise<NextResponse> => {
    const denied = await requireAdmin();
    if (denied) return denied;
    try {
      return await handler(...args);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
