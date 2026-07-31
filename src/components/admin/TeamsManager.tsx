"use client";

import { useMemo, useState } from "react";
import { Banner } from "./PublishButton";
import ClassBadge from "@/components/ClassBadge";
import {
  CLS_FILTER_ORDER,
  type Classification,
  type Team,
} from "@/lib/types";

export default function TeamsManager({ initial }: { initial: Team[] }) {
  const [teams, setTeams] = useState(initial);
  const [query, setQuery] = useState("");
  const [cls, setCls] = useState<Classification | "all">("all");
  const [editing, setEditing] = useState<Team | null>(null);
  const [showPriors, setShowPriors] = useState(false);
  const [message, setMessage] = useState<{
    tone: "good" | "bad";
    text: string;
  } | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams.filter((t) => {
      if (cls !== "all" && t.classification !== cls) return false;
      if (q && !t.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [teams, query, cls]);

  const withoutPriors = teams.filter((t) => t.preseason_prior === null).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-extrabold tracking-tight">Teams</h1>
        <button
          className="btn !py-1.5 !text-xs"
          onClick={() => setShowPriors((v) => !v)}
        >
          {showPriors ? "Hide" : "Import preseason ratings"}
        </button>
        <button
          className="btn !py-1.5 !text-xs"
          onClick={() =>
            setEditing({
              name: "",
              slug: "",
              classification: "6A",
              region: 1,
              preseason_prior: null,
              prior_source: null,
            })
          }
        >
          Add team
        </button>
      </div>

      {withoutPriors > 0 && (
        <Banner tone="warn">
          {withoutPriors} of {teams.length} teams have no preseason rating and
          will seed from their classification baseline alone.
        </Banner>
      )}

      {message && <Banner tone={message.tone}>{message.text}</Banner>}

      {showPriors && (
        <PriorsImport
          onDone={(updated) => {
            setMessage({
              tone: "good",
              text: `Updated ${updated} preseason ratings. Publish from the dashboard to apply them.`,
            });
            setShowPriors(false);
            location.reload();
          }}
        />
      )}

      {editing && (
        <TeamForm
          team={editing}
          onCancel={() => setEditing(null)}
          onSaved={(saved, note) => {
            setTeams((prev) => {
              const i = prev.findIndex((t) => t.id === saved.id);
              return i >= 0
                ? prev.map((t) => (t.id === saved.id ? saved : t))
                : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
            });
            setEditing(null);
            setMessage({ tone: "good", text: note });
          }}
        />
      )}

      <div className="space-y-3">
        <div className="table-scroll -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1.5 pb-1">
            {(["all", ...CLS_FILTER_ORDER] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCls(c as Classification | "all")}
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={
                  cls === c
                    ? { background: "rgb(var(--accent))", color: "#fff" }
                    : {
                        background: "rgb(var(--surface-2))",
                        color: "rgb(var(--text-muted))",
                      }
                }
              >
                {c === "all" ? "All" : c}
              </button>
            ))}
          </div>
        </div>

        <input
          type="search"
          className="input"
          placeholder="Search teams…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
          {visible.length} of {teams.length} teams
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
                <th className="px-3 py-2 text-left">Team</th>
                <th className="px-3 py-2 text-left">Class</th>
                <th className="px-3 py-2 text-right">Preseason</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr
                  key={t.id ?? t.name}
                  className="border-b last:border-0"
                  style={{ borderColor: "rgb(var(--border))" }}
                >
                  <td className="px-3 py-2 text-sm font-semibold">{t.name}</td>
                  <td className="px-3 py-2">
                    <ClassBadge
                      classification={t.classification}
                      region={t.region}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-bold tabular-nums">
                    {t.preseason_prior === null ? (
                      <span
                        className="text-[11px] font-semibold uppercase"
                        style={{ color: "rgb(var(--text-faint))" }}
                      >
                        none
                      </span>
                    ) : (
                      t.preseason_prior.toFixed(2)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="btn !px-2 !py-1 !text-xs"
                      onClick={() => setEditing(t)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TeamForm({
  team,
  onCancel,
  onSaved,
}: {
  team: Team;
  onCancel: () => void;
  onSaved: (t: Team, note: string) => void;
}) {
  const [form, setForm] = useState({
    name: team.name,
    classification: team.classification,
    region: String(team.region),
    preseason_prior:
      team.preseason_prior === null ? "" : String(team.preseason_prior),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/teams", {
        method: team.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: team.id,
          ...form,
          region: Number(form.region),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed.");

      const note = body.renamedFrom
        ? `Renamed ${body.renamedFrom} to ${body.team.name} and updated ${body.gamesUpdated} game references.`
        : `Saved ${body.team.name}.`;
      onSaved(body.team, note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wider">
        {team.id ? `Edit ${team.name}` : "Add team"}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: "rgb(var(--text-faint))" }}>
            Name
          </span>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: "rgb(var(--text-faint))" }}>
            Classification
          </span>
          <select
            className="input"
            value={form.classification}
            onChange={(e) =>
              setForm({
                ...form,
                classification: e.target.value as Classification,
              })
            }
          >
            {CLS_FILTER_ORDER.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: "rgb(var(--text-faint))" }}>
            Region
          </span>
          <input
            type="number"
            min={1}
            max={8}
            className="input"
            value={form.region}
            onChange={(e) => setForm({ ...form, region: e.target.value })}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: "rgb(var(--text-faint))" }}>
            Preseason rating
          </span>
          <input
            type="number"
            step="0.01"
            className="input"
            value={form.preseason_prior}
            placeholder="Blank = class baseline"
            onChange={(e) =>
              setForm({ ...form, preseason_prior: e.target.value })
            }
          />
        </label>
      </div>

      {team.id && form.name !== team.name && (
        <Banner tone="warn">
          Renaming also rewrites this team&rsquo;s games so its schedule stays
          attached.
        </Banner>
      )}
      {error && <Banner tone="bad">{error}</Banner>}

      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

interface PriorRow {
  raw: string;
  name: string | null;
  rating: number | null;
  error: string | null;
  warning: string | null;
}

function PriorsImport({ onDone }: { onDone: (updated: number) => void }) {
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<PriorRow[] | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "good" | "bad" | "warn";
    text: string;
  } | null>(null);

  async function preview() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/import/priors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not read that CSV.");
      setRows(body.rows);
      setMissing(body.missingTeams);
      setMessage({
        tone: body.errors ? "warn" : "good",
        text: `${body.matched} matched · ${body.errors} unmatched · ${body.missingTeams.length} roster teams left without a rating.`,
      });
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Preview failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/import/priors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Import failed.");
      onDone(body.updated);
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Import failed.",
      });
      setBusy(false);
    }
  }

  const bad = rows?.filter((r) => r.error) ?? [];
  const good = rows?.filter((r) => !r.error).length ?? 0;

  return (
    <div className="card space-y-3 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wider">
        Import preseason ratings
      </h2>
      <p className="text-sm" style={{ color: "rgb(var(--text-muted))" }}>
        Two columns: team name and rating. Names are matched against the roster,
        so 2025 spellings are fine. Teams left out keep their current value.
      </p>

      <input
        type="file"
        accept=".csv,text/csv"
        className="text-sm"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setCsv(await f.text());
        }}
      />
      <textarea
        className="input font-mono !text-xs"
        rows={6}
        placeholder={"Team,Rating\nThompson,36.97"}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />

      {message && <Banner tone={message.tone}>{message.text}</Banner>}

      {bad.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider">
            Unmatched rows
          </h3>
          <ul
            className="mt-1 space-y-0.5 text-xs"
            style={{ color: "rgb(var(--bad))" }}
          >
            {bad.slice(0, 40).map((r, i) => (
              <li key={i}>
                {r.raw} — {r.error}
              </li>
            ))}
            {bad.length > 40 && <li>…and {bad.length - 40} more</li>}
          </ul>
        </div>
      )}

      {missing.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider">
            Roster teams with no rating in this file ({missing.length})
          </summary>
          <p
            className="mt-1 text-xs"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            {missing.join(", ")}
          </p>
        </details>
      )}

      <div className="flex gap-2">
        <button
          className="btn"
          onClick={preview}
          disabled={busy || !csv.trim()}
        >
          {busy ? "Checking…" : "Check rows"}
        </button>
        {rows && (
          <button
            className="btn btn-primary"
            onClick={commit}
            disabled={busy || !good}
          >
            Apply {good} rating{good === 1 ? "" : "s"}
          </button>
        )}
      </div>
    </div>
  );
}
