"use client";

import { useState } from "react";
import { Banner } from "./PublishButton";
import { weekLabel } from "@/lib/format";
import { redundantIds, type DuplicateGroup } from "@/lib/duplicates";
import type { Game } from "@/lib/types";

type Group = DuplicateGroup;

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
 * Surfaces fixtures stored twice and lets one side be removed.
 *
 * Re-importing cannot create these — the unique key prevents it. They come
 * from two sources disagreeing about which team is at home, or about the week.
 */
export default function DuplicateFinder() {
  const [reversed, setReversed] = useState<Group[]>([]);
  const [repeated, setRepeated] = useState<Group[]>([]);
  const [scanned, setScanned] = useState(false);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "good" | "bad" | "warn";
    text: string;
  } | null>(null);

  async function scan() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/games/duplicates");
      const body = await readJson<{
        error?: string;
        totalGames: number;
        reversed: Group[];
        repeated: Group[];
      }>(res);
      if (!res.ok) throw new Error(body.error ?? "Scan failed.");
      setReversed(body.reversed);
      setRepeated(body.repeated);
      setTotal(body.totalGames);
      setScanned(true);
      setMessage({
        tone: body.reversed.length ? "warn" : "good",
        text: `${body.totalGames} games · ${body.reversed.length} stored with the sides swapped · ${body.repeated.length} same pairing in more than one week.`,
      });
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Scan failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(ids: number[]) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/games/duplicates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const body = await readJson<{ error?: string; deleted: number }>(res);
      if (!res.ok) throw new Error(body.error ?? "Delete failed.");
      setMessage({
        tone: "good",
        text: `Deleted ${body.deleted} game(s). Publish from the dashboard to update the site.`,
      });
      await scan();
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Delete failed.",
      });
      setBusy(false);
    }
  }

  const allRedundant = reversed.flatMap(redundantIds);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[13px] font-bold uppercase tracking-wider">
          Duplicate check
        </h2>
        <button className="btn !py-1.5 !text-xs" onClick={scan} disabled={busy}>
          {busy ? "Scanning…" : scanned ? "Re-scan" : "Scan for duplicates"}
        </button>
        {reversed.length > 0 && (
          <button
            className="btn btn-primary !py-1.5 !text-xs"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  `Delete ${allRedundant.length} redundant game(s)? The copy carrying a score is kept, otherwise the earliest entry.`,
                )
              ) {
                remove(allRedundant);
              }
            }}
          >
            Remove {allRedundant.length} redundant
          </button>
        )}
      </div>

      <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
        Re-running an import cannot create duplicates — games are keyed on home,
        away, week and type, so a repeat import updates the same row. These come
        from two sources disagreeing about which side is at home, or about which
        week a game falls in.
      </p>

      {message && <Banner tone={message.tone}>{message.text}</Banner>}

      {reversed.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold">
            Same fixture, sides swapped ({reversed.length})
          </h3>
          <div className="mt-2 space-y-2">
            {reversed.map((g, i) => (
              <GroupRow key={i} group={g} onDelete={remove} busy={busy} />
            ))}
          </div>
        </div>
      )}

      {repeated.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold">
            Same pairing in more than one week ({repeated.length})
          </h3>
          <p
            className="mt-1 text-xs"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            Usually a week mismatch between sources, but two schools genuinely
            can meet twice. Check before removing anything.
          </p>
          <div className="mt-2 space-y-2">
            {repeated.map((g, i) => (
              <GroupRow key={i} group={g} onDelete={remove} busy={busy} />
            ))}
          </div>
        </div>
      )}

      {scanned && !reversed.length && !repeated.length && (
        <Banner tone="good">
          No duplicates found across {total} games.
        </Banner>
      )}
    </section>
  );
}

function GroupRow({
  group,
  onDelete,
  busy,
}: {
  group: Group;
  onDelete: (ids: number[]) => void;
  busy: boolean;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: "rgb(var(--surface-2))" }}
    >
      <div className="text-[12px] font-semibold">{group.label}</div>
      <div className="mt-1.5 space-y-1">
        {group.games.map((g) => (
          <div key={g.id} className="flex items-center gap-2 text-[12px]">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{g.t1}</span>
              <span style={{ color: "rgb(var(--text-faint))" }}> vs </span>
              <span className="font-semibold">{g.t2}</span>
              <span style={{ color: "rgb(var(--text-faint))" }}>
                {" · "}
                {weekLabel(g)}
                {g.s1 !== null && g.s2 !== null
                  ? ` · ${g.s1}–${g.s2}`
                  : " · no score"}
              </span>
            </span>
            <button
              className="btn !px-2 !py-0.5 !text-[11px]"
              style={{ color: "rgb(var(--bad))" }}
              disabled={busy}
              onClick={() => {
                if (confirm(`Delete ${g.t1} vs ${g.t2} (${weekLabel(g)})?`)) {
                  onDelete([g.id as number]);
                }
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
