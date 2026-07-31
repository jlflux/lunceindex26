import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/**
 * Guards every /admin surface except the login page itself. Runs on the Edge
 * runtime, which is why auth.ts sticks to Web Crypto.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin/login") return NextResponse.next();

  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    // Failing closed: without a secret we cannot verify anything.
    return NextResponse.redirect(new URL("/admin/login?error=setup", req.url));
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySession(token, secret)) return NextResponse.next();

  const url = new URL("/admin/login", req.url);
  // Bounce back to where they were headed after a successful login.
  if (pathname !== "/admin") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*"],
};
