"use client";

import { useEffect, useState } from "react";
import { Banner } from "./PublishButton";

async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const body = await res.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    const snippet = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    throw new Error(`Server returned ${res.status}: ${snippet.slice(0, 160)}`);
  }
}

/**
 * Schools that play a schedule but hold no rating.
 *
 * Kept apart from the roster on purpose: the engine values any name it cannot
 * find in `teams` off the field mean, so being absent from the roster is what
 * makes a school out-of-state. Naming them here only tells the importer that
 * "Tharptown" is a real independent rather than a typo, so its games come in
 * instead of being reported and dropped.
 */
export default function NonMemberList() {
  const [names, setNames] = useState<string[]>([]);
  const [entry, setEntry] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "good" | "bad" | "warn";
    text: string;
  } | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/admin/non-members");
      const body = await readJson<{ names: string[]; error?: string }>(res);
      if (!res.ok) throw new Error(body.error ?? "Could not load the list.");
      setNames(body.names.sort((a, b) => a.localeCompare(b)));
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Could not load the list.",
      });
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    const name = entry.trim();
    if (!name) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/non-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(body.error ?? "Could not add that name.");
      setEntry("");
      setMessage({
        tone: "good",
        text: `${name} will import as out-of-state from the next fetch.`,
      });
      await load();
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Could not add that name.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    if (!confirm(`Remove ${name}? Its games will stop importing.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/non-members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(body.error ?? "Could not remove that name.");
      await load();
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Could not remove that name.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-[13px] font-bold uppercase tracking-wider">
        Non-member schools
      </h2>

      <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
        Independents, AISA programs and anyone else off the classification list.
        They are not on the roster and never receive a rating — their games
        count toward your teams&rsquo; records and are valued off the field
        average. Listing a name here tells the importer it is a real school
        rather than a misspelling, so its games come in instead of being
        reported and skipped.
      </p>

      <div className="flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          value={entry}
          placeholder="e.g. Tharptown"
          disabled={busy}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn btn-primary" onClick={add} disabled={busy}>
          Add
        </button>
      </div>

      {message && <Banner tone={message.tone}>{message.text}</Banner>}

      {names.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {names.map((n) => (
            <span
              key={n}
              className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold"
              style={{ background: "rgb(var(--surface-2))" }}
            >
              {n}
              <button
                onClick={() => remove(n)}
                disabled={busy}
                aria-label={`Remove ${n}`}
                style={{ color: "rgb(var(--bad))" }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
          None listed yet.
        </p>
      )}
    </section>
  );
}
