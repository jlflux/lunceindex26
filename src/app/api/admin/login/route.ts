import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSession,
  verifyPassword,
} from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = (await req.json()) as { password?: string };

  const hash = process.env.ADMIN_PASSWORD_HASH;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!hash || !secret) {
    return NextResponse.json(
      {
        error:
          "Admin login is not configured. Set ADMIN_PASSWORD_HASH and ADMIN_SESSION_SECRET.",
      },
      { status: 500 },
    );
  }

  if (!password || !(await verifyPassword(password, hash))) {
    // Deliberately vague — no hint about which part was wrong.
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
