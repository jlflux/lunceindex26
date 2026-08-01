"use client";

import { useMemo, useState } from "react";
import { AdminHeader } from "./AdminShell";
import DuplicateFinder from "./DuplicateFinder";
import { Banner } from "./PublishButton";
import { weekLabel } from "@/lib/format";
import { PLAYOFF_ROUND_LABELS, type Game, type PlayoffRound } from "@/lib/types";

const ROUNDS = Object.keys(PLAYOFF_ROUND_LABELS) as PlayoffRound[];

const emptyForm = {
  id: null as number | null,
  t1: "",
  t2: "",
  s1: "",
  s2: "",
  week: "0",
  type: "regular" as "regular" | "playoff",
  round: "r1" as PlayoffRound,
  neutral_site: false,
};

export default function GamesManager({
  teamNames,
  initialGames,
}: {
  teamNames: string[];
  initialGames: Game[];
}) {
  const [games, setGames] = useState(initialGames);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "good" | "bad";
    text: string;
  } | null>(null);

  const [filterWeek, setFilterWeek] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [onlyUnplayed, setOnlyUnplayed] = useState(false);

  const weeks = useMemo(
    () => [...new Set(games.map((g) => g.week))].sort((a, b) => a - b),
    [games],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return games
      .filter((g) => {
        if (filterWeek !== "all" && String(g.week) !== filterWeek) return false;
        if (onlyUnplayed && g.s1 !== null && g.s2 !== null) return false;
        if (q && !`${g.t1} ${g.t2}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .slice(0, 300);
  }, [games, filterWeek, query, onlyUnplayed]);

  function edit(g: Game) {
    setForm({
      id: g.id ?? null,
      t1: g.t1,
      t2: g.t2,
      s1: g.s1 === null ? "" : String(g.s1),
      s2: g.s2 === null ? "" : String(g.s2),
      week: String(g.week),
      type: g.type,
      round: (g.round ?? "r1") as PlayoffRound,
      neutral_site: Boolean(g.neutral_site),
    });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/games", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          week: Number(form.week),
          round: form.type === "playoff" ? form.round : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed.");

      const saved = body.game as Game;
      setGames((prev) => {
        const i = prev.findIndex((g) => g.id === saved.id);
        return i >= 0
          ? prev.map((g) => (g.id === saved.id ? saved : g))
          : [...prev, saved];
      });
      setForm(emptyForm);
      setMessage({
        tone: "good",
        text: `Saved ${saved.t1} vs ${saved.t2}. Publish from the dashboard to update the site.`,
      });
    } catch (err) {
      setMessage({
        tone: "bad",
        text: err instanceof Error ? err.message : "Save failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(g: Game) {
    if (
      !confirm(
        `Delete ${g.t1} vs ${g.t2} (${weekLabel(g)})? This cannot be undone.`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/games?id=${g.id}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) {
      setMessage({ tone: "bad", text: body.error ?? "Delete failed." });
      return;
    }
    setGames((prev) => prev.filter((x) => x.id !== g.id));
    setMessage({ tone: "good", text: `Deleted ${g.t1} vs ${g.t2}.` });
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Games"
        subtitle="Add results one at a time, or edit anything already on file."
      />

      <DuplicateFinder />

      <form onSubmit={save} className="card space-y-4 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider">
          {form.id ? "Edit game" : "Add a game"}
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Home team">
            <input
              list="team-names"
              className="input"
              value={form.t1}
              onChange={(e) => setForm({ ...form, t1: e.target.value })}
              placeholder="Start typing…"
              required
            />
          </Field>
          <Field label="Away team">
            <input
              list="team-names"
              className="input"
              value={form.t2}
              onChange={(e) => setForm({ ...form, t2: e.target.value })}
              placeholder="Out-of-state names are allowed"
              required
            />
          </Field>
          <Field label="Home score">
            <input
              type="number"
              min={0}
              max={200}
              className="input"
              value={form.s1}
              onChange={(e) => setForm({ ...form, s1: e.target.value })}
              placeholder="Leave blank if unplayed"
            />
          </Field>
          <Field label="Away score">
            <input
              type="number"
              min={0}
              max={200}
              className="input"
              value={form.s2}
              onChange={(e) => setForm({ ...form, s2: e.target.value })}
              placeholder="Leave blank if unplayed"
            />
          </Field>
        </div>

        <datalist id="team-names">
          {teamNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Week">
            <input
              type="number"
              min={0}
              max={20}
              className="input"
              value={form.week}
              onChange={(e) => setForm({ ...form, week: e.target.value })}
              required
            />
          </Field>
          <Field label="Season">
            <select
              className="input"
              value={form.type}
              onChange={(e) =>
                setForm({
                  ...form,
                  type: e.target.value as "regular" | "playoff",
                })
              }
            >
              <option value="regular">Regular season</option>
              <option value="playoff">Playoffs</option>
            </select>
          </Field>
          {form.type === "playoff" && (
            <Field label="Round">
              <select
                className="input"
                value={form.round}
                onChange={(e) =>
                  setForm({ ...form, round: e.target.value as PlayoffRound })
                }
              >
                {ROUNDS.map((r) => (
                  <option key={r} value={r}>
                    {PLAYOFF_ROUND_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.neutral_site}
            onChange={(e) =>
              setForm({ ...form, neutral_site: e.target.checked })
            }
          />
          Neutral site (no home-field advantage in projections)
        </label>

        <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
          A game only counts toward ratings once both scores are entered.
          Leaving them blank keeps it on the schedule as upcoming.
        </p>

        {message && <Banner tone={message.tone}>{message.text}</Banner>}

        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : form.id ? "Update game" : "Add game"}
          </button>
          {form.id && (
            <button
              type="button"
              className="btn"
              onClick={() => setForm(emptyForm)}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Browser */}
      <section className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            className="input"
            value={filterWeek}
            onChange={(e) => setFilterWeek(e.target.value)}
          >
            <option value="all">All weeks</option>
            {weeks.map((w) => (
              <option key={w} value={String(w)}>
                Week {w}
              </option>
            ))}
          </select>
          <input
            type="search"
            className="input"
            placeholder="Search teams…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyUnplayed}
              onChange={(e) => setOnlyUnplayed(e.target.checked)}
            />
            Only games without scores
          </label>
        </div>

        <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
          Showing {visible.length} of {games.length} games
          {visible.length === 300 && " (first 300 — narrow the filters)"}
        </p>

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
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Matchup</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((g) => (
                <tr
                  key={g.id}
                  className="border-b last:border-0"
                  style={{ borderColor: "rgb(var(--border))" }}
                >
                  <td
                    className="whitespace-nowrap px-3 py-2 text-xs"
                    style={{ color: "rgb(var(--text-muted))" }}
                  >
                    {weekLabel(g)}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    <span className="font-semibold">{g.t1}</span>
                    <span style={{ color: "rgb(var(--text-faint))" }}> vs </span>
                    <span className="font-semibold">{g.t2}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-bold tabular-nums">
                    {g.s1 !== null && g.s2 !== null ? (
                      `${g.s1}–${g.s2}`
                    ) : (
                      <span
                        className="text-[11px] font-semibold uppercase"
                        style={{ color: "rgb(var(--text-faint))" }}
                      >
                        Upcoming
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      onClick={() => edit(g)}
                      className="btn !px-2 !py-1 !text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(g)}
                      className="btn !ml-1.5 !px-2 !py-1 !text-xs"
                      style={{ color: "rgb(var(--bad))" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-10 text-center text-sm"
                    style={{ color: "rgb(var(--text-faint))" }}
                  >
                    No games match those filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wider"
        style={{ color: "rgb(var(--text-faint))" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
