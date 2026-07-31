"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "setup"
      ? "Admin is not configured yet. Set ADMIN_SESSION_SECRET and ADMIN_PASSWORD_HASH."
      : null,
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Sign in failed.");
      router.replace(params.get("next") ?? "/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">
          ALPreps<span style={{ color: "rgb(var(--brand))" }}> Admin</span>
        </h1>
        <p className="mt-1 text-sm" style={{ color: "rgb(var(--text-muted))" }}>
          Sign in to manage ratings and results.
        </p>
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          autoFocus
          autoComplete="current-password"
        />
      </div>

      {error && (
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            background: "rgb(var(--bad-soft))",
            color: "rgb(var(--bad))",
          }}
        >
          {error}
          {params.get("error") === "setup" && (
            <>
              {" "}
              <a href="/admin/setup" className="font-semibold underline">
                Generate them here.
              </a>
            </>
          )}
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary w-full"
        disabled={busy || !password}
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
