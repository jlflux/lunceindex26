"use client";

import { useState } from "react";

interface PublishResult {
  generated: string;
  teams: number;
  gamesPlayed: number;
  maxWeekPlayed: number;
  priorBlend: number;
  top: {
    rank: number;
    name: string;
    classification: string;
    rating: number;
    record: string;
  }[];
}

/**
 * Recomputing is the only thing that changes what the public site shows —
 * edits stay invisible until this runs.
 */
export default function PublishButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/publish", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Publish failed.");
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={publish} className="btn btn-primary" disabled={busy}>
          {busy ? "Recomputing…" : "Recompute & publish"}
        </button>
        <span className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
          Runs the full solve and updates the public site.
        </span>
      </div>

      {error && <Banner tone="bad">{error}</Banner>}

      {result && (
        <div className="space-y-3">
          <Banner tone="good">
            Published {new Date(result.generated).toLocaleString()} —{" "}
            {result.teams} teams, {result.gamesPlayed} games played, preseason
            carry-over {Math.round(result.priorBlend * 100)}%.
          </Banner>

          <div className="card table-scroll">
            <table className="w-full">
              <thead>
                <tr
                  className="border-b text-[11px] uppercase tracking-wider"
                  style={{
                    borderColor: "rgb(var(--border))",
                    color: "rgb(var(--text-faint))",
                  }}
                >
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Team</th>
                  <th className="px-3 py-2 text-left">Class</th>
                  <th className="px-3 py-2 text-right">Rating</th>
                  <th className="px-3 py-2 text-right">Rec</th>
                </tr>
              </thead>
              <tbody>
                {result.top.map((r) => (
                  <tr
                    key={r.name}
                    className="border-b last:border-0"
                    style={{ borderColor: "rgb(var(--border))" }}
                  >
                    <td
                      className="px-3 py-2 text-sm font-bold"
                      style={{ color: "rgb(var(--text-faint))" }}
                    >
                      {r.rank}
                    </td>
                    <td className="px-3 py-2 text-sm font-semibold">{r.name}</td>
                    <td
                      className="px-3 py-2 text-sm"
                      style={{ color: "rgb(var(--text-muted))" }}
                    >
                      {r.classification}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-bold tabular-nums">
                      {r.rating.toFixed(2)}
                    </td>
                    <td
                      className="px-3 py-2 text-right text-sm tabular-nums"
                      style={{ color: "rgb(var(--text-muted))" }}
                    >
                      {r.record}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: "good" | "bad" | "warn";
  children: React.ReactNode;
}) {
  const colors = {
    good: ["rgb(var(--good) / 0.1)", "rgb(var(--good))"],
    bad: ["rgb(var(--bad) / 0.1)", "rgb(var(--bad))"],
    warn: ["rgb(202 138 4 / 0.12)", "rgb(202 138 4)"],
  }[tone];

  return (
    <p
      className="rounded-lg px-3 py-2 text-sm"
      style={{ background: colors[0], color: colors[1] }}
    >
      {children}
    </p>
  );
}
