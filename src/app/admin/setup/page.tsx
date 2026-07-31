"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import ThemeToggle from "@/components/ThemeToggle";
import { hashPassword } from "@/lib/auth";

/**
 * Generates the two admin environment variables in the browser.
 *
 * Everything here runs client-side: the password is hashed with Web Crypto in
 * the page and never sent anywhere. This exists because the equivalent CLI
 * script needs a terminal, which is not always available.
 *
 * The page is exempt from the admin guard in middleware.ts — it has to be
 * reachable before ADMIN_PASSWORD_HASH exists. It reads no data and grants no
 * access; it is a calculator.
 */
export default function AdminSetupPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [result, setResult] = useState<{ hash: string; secret: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 12) {
      setError("Use at least 12 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const hash = await hashPassword(password);
      const secret = btoa(
        String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      setResult({ hash, secret });
    } catch {
      setError("Could not generate. Make sure the page is served over HTTPS.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">
            Admin setup
          </h1>
          <p
            className="mt-1.5 text-sm leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            Generates the two environment variables the admin login needs.
            Everything runs in this page — your password is never sent anywhere.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <form onSubmit={generate} className="card space-y-4 p-5">
        <div>
          <label htmlFor="pw" className="label">
            Choose an admin password
          </label>
          <input
            id="pw"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 12 characters"
          />
        </div>

        <div>
          <label htmlFor="pw2" className="label">
            Confirm
          </label>
          <input
            id="pw2"
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        {error && (
          <p
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              background: "rgb(var(--bad-soft))",
              color: "rgb(var(--bad))",
            }}
          >
            {error}
          </p>
        )}

        <button
          className="btn btn-primary"
          disabled={busy || !password || !confirm}
        >
          {busy ? "Generating…" : "Generate variables"}
        </button>
      </form>

      {result && (
        <div className="mt-5 space-y-4">
          <div
            className="rounded-xl px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "rgb(var(--good-soft))",
              color: "rgb(var(--good))",
            }}
          >
            Add both of these in Vercel under{" "}
            <strong>Settings → Environment Variables</strong>, then redeploy.
            Keep your password somewhere safe — it cannot be recovered from the
            hash.
          </div>

          <EnvVar name="ADMIN_PASSWORD_HASH" value={result.hash} />
          <EnvVar name="ADMIN_SESSION_SECRET" value={result.secret} />

          <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
            The hash is safe to store — it cannot be reversed into your
            password. The session secret signs the login cookie; changing it
            later just signs everyone out.
          </p>
        </div>
      )}
    </main>
  );
}

function EnvVar({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked; the value is selectable either way.
    }
  }

  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-2"
        style={{
          borderColor: "rgb(var(--border))",
          background: "rgb(var(--surface-2))",
        }}
      >
        <code className="text-xs font-bold">{name}</code>
        <button onClick={copy} className="btn !py-1 !text-xs">
          <Icon name={copied ? "check" : "copy"} size={13} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="px-4 py-3">
        <code className="block break-all font-mono text-xs leading-relaxed">
          {value}
        </code>
      </div>
    </div>
  );
}
