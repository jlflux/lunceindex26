"use client";

import { useState } from "react";
import { AdminHeader } from "./AdminShell";
import { Banner } from "./PublishButton";
import type { ScoreRow } from "@/lib/score-csv";
import { PLAYOFF_ROUND_LABELS, type PlayoffRound } from "@/lib/types";

const ROUNDS = Object.keys(PLAYOFF_ROUND_LABELS) as PlayoffRound[];

/**
 * Reads a response that is *supposed* to be JSON.
 *
 * A serverless function that times out or crashes returns the platform's HTML
 * error page. Parsing that as JSON produced "Unexpected token 'A'…", which
 * says nothing useful, so non-JSON is surfaced as its own message.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson<T = any>(res: Response): Promise<T> {
  const body = await res.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    const snippet = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    throw new Error(
      res.status === 504 || /timed? ?out/i.test(snippet)
        ? "The server took too long and gave up. Try a smaller batch."
        : `Server returned ${res.status}: ${snippet.slice(0, 160) || "no details"}`,
    );
  }
}


type Mode = "scores" | "schedule" | "ahsfhs";

export default function ImportManager() {
  const [mode, setMode] = useState<Mode>("scores");

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Import"
        subtitle="Bulk-load a week of scores, or pull a schedule straight from the AHSAA PDF."
      />

      <div
        className="flex gap-1 rounded-xl p-1"
        style={{ background: "rgb(var(--surface-2))" }}
      >
        {(
          [
            ["scores", "Weekly scores (CSV)"],
            ["schedule", "Schedule (AHSAA PDF)"],
            ["ahsfhs", "Full schedules (ahsfhs.org)"],
          ] as [Mode, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
            style={
              mode === id
                ? {
                    background: "rgb(var(--surface))",
                    boxShadow: "var(--shadow)",
                  }
                : { color: "rgb(var(--text-muted))" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "scores" ? (
        <ScoreImport />
      ) : mode === "schedule" ? (
        <ScheduleImport />
      ) : (
        <AhsfhsImport />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- scores

function ScoreImport() {
  const [csv, setCsv] = useState("");
  const [week, setWeek] = useState("0");
  const [type, setType] = useState<"regular" | "playoff">("regular");
  const [round, setRound] = useState<PlayoffRound>("r1");
  const [rows, setRows] = useState<ScoreRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "good" | "bad" | "warn";
    text: string;
  } | null>(null);

  async function preview() {
    setBusy(true);
    setMessage(null);
    setRows(null);
    try {
      const res = await fetch("/api/admin/import/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, week: Number(week), type, round }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? "Could not read that CSV.");
      setRows(body.rows);
      setMessage({
        tone: body.errors ? "warn" : "good",
        text: `${body.ok} row${body.ok === 1 ? "" : "s"} ready· ${body.errors} with errors · ${body.warnings} to check.`,
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
    if (!rows) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/import/scores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? "Import failed.");
      setMessage({
        tone: "good",
        text: `Imported ${body.imported} games. Publish from the dashboard to update the site.`,
      });
      setRows(null);
      setCsv("");
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Import failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  const importable = rows?.filter((r) => !r.error).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <p className="text-sm" style={{ color: "rgb(var(--text-muted))" }}>
          Needs columns for home team, away team, home score and away score —
          any order, and the usual header spellings are accepted. Week, type and
          round columns are optional; the defaults below fill in when they are
          missing. Team names run through the same matcher the PDF import uses,
          so spellings need not be exact.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: "rgb(var(--text-faint))" }}>
              Default week
            </span>
            <input
              type="number"
              min={0}
              max={20}
              className="input"
              value={week}
              onChange={(e) => setWeek(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: "rgb(var(--text-faint))" }}>
              Default season
            </span>
            <select
              className="input"
              value={type}
              onChange={(e) =>
                setType(e.target.value as "regular" | "playoff")
              }
            >
              <option value="regular">Regular season</option>
              <option value="playoff">Playoffs</option>
            </select>
          </label>
          {type === "playoff" && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: "rgb(var(--text-faint))" }}>
                Default round
              </span>
              <select
                className="input"
                value={round}
                onChange={(e) => setRound(e.target.value as PlayoffRound)}
              >
                {ROUNDS.map((r) => (
                  <option key={r} value={r}>
                    {PLAYOFF_ROUND_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div>
          <input
            type="file"
            accept=".csv,text/csv"
            className="text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setCsv(await f.text());
            }}
          />
        </div>

        <textarea
          className="input font-mono !text-xs"
          rows={8}
          placeholder={"Home,Away,Home Score,Away Score\nThompson,Hoover,28,21"}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />

        <button
          className="btn btn-primary"
          onClick={preview}
          disabled={busy || !csv.trim()}
        >
          {busy ? "Checking…" : "Check rows"}
        </button>
      </div>

      {message && <Banner tone={message.tone}>{message.text}</Banner>}

      {rows && (
        <>
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
                  <th className="px-3 py-2 text-left">Matchup</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-left">Week</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    className="border-b last:border-0"
                    style={{
                      borderColor: "rgb(var(--border))",
                      background: r.error ? "rgb(var(--bad) / 0.06)" : undefined,
                    }}
                  >
                    <td className="px-3 py-2 text-sm">
                      <span className="font-semibold">
                        {r.home ?? r.homeRaw}
                      </span>
                      <span style={{ color: "rgb(var(--text-faint))" }}>
                        {" "}
                        vs{" "}
                      </span>
                      <span className="font-semibold">
                        {r.away ?? r.awayRaw}
                      </span>
                      {(r.home !== r.homeRaw || r.away !== r.awayRaw) && (
                        <div
                          className="text-[11px]"
                          style={{ color: "rgb(var(--text-faint))" }}
                        >
                          from &ldquo;{r.homeRaw}&rdquo; / &ldquo;{r.awayRaw}
                          &rdquo;
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-bold tabular-nums">
                      {r.homeScore !== null && r.awayScore !== null
                        ? `${r.homeScore}–${r.awayScore}`
                        : "—"}
                    </td>
                    <td
                      className="px-3 py-2 text-xs"
                      style={{ color: "rgb(var(--text-muted))" }}
                    >
                      {r.week}
                      {r.type === "playoff" && ` · ${r.round}`}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.error ? (
                        <span style={{ color: "rgb(var(--bad))" }}>
                          {r.error}
                        </span>
                      ) : r.warning ? (
                        <span style={{ color: "rgb(202 138 4)" }}>
                          {r.warning}
                        </span>
                      ) : (
                        <span style={{ color: "rgb(var(--good))" }}>Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            className="btn btn-primary"
            onClick={commit}
            disabled={busy || !importable}
          >
            {busy
              ? "Importing…"
              : `Import ${importable} game${importable === 1 ? "" : "s"}`}
          </button>
          <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
            Rows with errors are skipped. Re-importing a corrected file updates
            the same games rather than duplicating them.
          </p>
        </>
      )}
    </div>
  );
}

// -------------------------------------------------------------- schedule

interface ParsedGame {
  date: string;
  home: string;
  away: string;
  homeRaw: string;
  awayRaw: string;
  homeMethod: string;
  awayMethod: string;
  outOfState: boolean;
}

function ScheduleImport() {
  const [week, setWeek] = useState("0");
  const [type, setType] = useState<"regular" | "playoff">("regular");
  const [round, setRound] = useState<PlayoffRound>("r1");
  const [report, setReport] = useState<{
    games: ParsedGame[];
    totalRows: number;
    warnings: string[];
    duplicates: string[];
    skipped: { line: string; reason: string }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "good" | "bad" | "warn";
    text: string;
  } | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setMessage(null);
    setReport(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/import/schedule", {
        method: "POST",
        body: form,
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? "Could not read that PDF.");
      setReport(body);
      setMessage({
        tone: body.skipped.length ? "warn" : "good",
        text: `Read ${body.totalRows} rows → ${body.games.length} games. ${body.duplicates.length} duplicate listing(s) collapsed, ${body.skipped.length} row(s) skipped.`,
      });
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Upload failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!report) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/import/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          games: report.games.map((g) => ({
            home: g.home,
            away: g.away,
            date: g.date,
          })),
          week: Number(week),
          type,
          round,
        }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? "Import failed.");
      setMessage({
        tone: "good",
        text: `Imported ${body.imported} games${
          body.skippedAlreadyPlayed
            ? `, left ${body.skippedAlreadyPlayed} alone because they already have scores`
            : ""
        }.`,
      });
      setReport(null);
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Import failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <p className="text-sm" style={{ color: "rgb(var(--text-muted))" }}>
          Upload the weekly AHSAA schedule PDF. Classification always comes from
          your roster, never from the PDF — the published files contain class
          errors. Scores are never touched, and games that already have a result
          are left alone.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: "rgb(var(--text-faint))" }}>
              Week
            </span>
            <input
              type="number"
              min={0}
              max={20}
              className="input"
              value={week}
              onChange={(e) => setWeek(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: "rgb(var(--text-faint))" }}>
              Season
            </span>
            <select
              className="input"
              value={type}
              onChange={(e) =>
                setType(e.target.value as "regular" | "playoff")
              }
            >
              <option value="regular">Regular season</option>
              <option value="playoff">Playoffs</option>
            </select>
          </label>
          {type === "playoff" && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: "rgb(var(--text-faint))" }}>
                Round
              </span>
              <select
                className="input"
                value={round}
                onChange={(e) => setRound(e.target.value as PlayoffRound)}
              >
                {ROUNDS.map((r) => (
                  <option key={r} value={r}>
                    {PLAYOFF_ROUND_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <input
          type="file"
          accept=".pdf,application/pdf"
          className="text-sm"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
        {busy && (
          <p className="text-sm" style={{ color: "rgb(var(--text-muted))" }}>
            Reading PDF…
          </p>
        )}
      </div>

      {message && <Banner tone={message.tone}>{message.text}</Banner>}

      {report && (
        <>
          {report.warnings.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-bold">Check these matches</h3>
              <ul
                className="mt-2 space-y-1 text-xs"
                style={{ color: "rgb(var(--text-muted))" }}
              >
                {report.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {report.skipped.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-bold">
                Skipped rows ({report.skipped.length})
              </h3>
              <ul className="mt-2 space-y-2 text-xs">
                {report.skipped.map((s, i) => (
                  <li key={i}>
                    <div style={{ color: "rgb(var(--bad))" }}>{s.reason}</div>
                    <div
                      className="font-mono"
                      style={{ color: "rgb(var(--text-faint))" }}
                    >
                      {s.line.slice(0, 140)}
                    </div>
                  </li>
                ))}
              </ul>
              <p
                className="mt-2 text-xs"
                style={{ color: "rgb(var(--text-muted))" }}
              >
                Usually a school missing from the roster. Add it on the Teams
                page, then re-upload.
              </p>
            </div>
          )}

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
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Matchup</th>
                  <th className="px-3 py-2 text-left">Matched by</th>
                </tr>
              </thead>
              <tbody>
                {report.games.map((g, i) => (
                  <tr
                    key={i}
                    className="border-b last:border-0"
                    style={{ borderColor: "rgb(var(--border))" }}
                  >
                    <td
                      className="whitespace-nowrap px-3 py-2 text-xs"
                      style={{ color: "rgb(var(--text-muted))" }}
                    >
                      {g.date}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span className="font-semibold">{g.home}</span>
                      <span style={{ color: "rgb(var(--text-faint))" }}>
                        {" "}
                        vs{" "}
                      </span>
                      <span className="font-semibold">{g.away}</span>
                      {g.outOfState && (
                        <span
                          className="ml-1.5 text-[10px] font-semibold uppercase"
                          style={{ color: "rgb(var(--text-faint))" }}
                        >
                          non-AHSAA
                        </span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2 text-[11px]"
                      style={{
                        color:
                          g.homeMethod === "fuzzy" || g.awayMethod === "fuzzy"
                            ? "rgb(202 138 4)"
                            : "rgb(var(--text-faint))",
                      }}
                    >
                      {g.homeMethod} / {g.awayMethod}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn btn-primary" onClick={commit} disabled={busy}>
            {busy
              ? "Importing…"
              : `Import ${report.games.length} games into week ${week}`}
          </button>
        </>
      )}
    </div>
  );
}


// -------------------------------------------------------------- ahsfhs.org

interface AhsfhsRow {
  home: string;
  away: string;
  week: number;
  date: string | null;
  source: string;
  note: string | null;
  homeScore: number | null;
  awayScore: number | null;
}

/**
 * "wk0 140 · wk1 196 · …", so a fetch that quietly comes back week-0-only is
 * visible before anything is committed rather than after.
 */
function weekSpread(rows: { week: number }[]): string {
  const byWeek = new Map<number, number>();
  for (const r of rows) byWeek.set(r.week, (byWeek.get(r.week) ?? 0) + 1);
  if (!byWeek.size) return "";
  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, n]) => `wk${w} ${n}`)
    .join(" · ");
}

/**
 * The AHSAA's weekly PDFs omit games. ahsfhs.org carries a full schedule per
 * team, so this pulls from there — either by fetching directly (only works
 * where the deployment can reach the site) or from saved pages.
 */
function AhsfhsImport() {
  const [rows, setRows] = useState<AhsfhsRow[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [week, setWeek] = useState("0");
  const [diag, setDiag] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    tone: "good" | "bad" | "warn";
    text: string;
  } | null>(null);

  async function upload(files: FileList) {
    setBusy(true);
    setMessage(null);
    setRows(null);
    try {
      const form = new FormData();
      for (const f of Array.from(files)) form.append("files", f);
      const res = await fetch("/api/admin/import/ahsfhs", {
        method: "POST",
        body: form,
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? "Could not read those pages.");
      setRows(body.games);
      setProblems(body.problems ?? []);
      setMessage({
        tone: body.problems?.length ? "warn" : "good",
        text: `${body.files} page(s) → ${body.games.length} games, ${body.duplicates} duplicate listings collapsed.`,
      });
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Upload failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function fetchAll(week?: number) {
    setBusy(true);
    setMessage(null);
    setRows(null);
    setProblems([]);

    // Walked in batches: one request cannot outlive a serverless invocation,
    // and 393 pages is far more than it allows.
    const all: AhsfhsRow[] = [];
    const issues: string[] = [];
    let offset = 0;
    let total = 0;
    let fetched = 0;

    try {
      for (;;) {
        const res = await fetch("/api/admin/import/ahsfhs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offset,
            batch: 20,
            ...(week === undefined ? {} : { week }),
          }),
        });
        const body = await readJson(res);
        if (!res.ok) throw new Error(String(body.error ?? "Fetch failed."));

        all.push(...((body.games as AhsfhsRow[]) ?? []));
        issues.push(...((body.problems as string[]) ?? []));
        fetched += Number(body.fetched ?? 0);
        total = Number(body.total ?? 0);
        offset = Number(body.nextOffset ?? offset);

        setProgress({ done: offset, total });
        // The server gave up because the site stopped answering. Say so
        // plainly rather than presenting a near-empty result as a finished
        // run — importing that would look like every team lost its schedule.
        if (body.aborted) {
          setRows(null);
          setProblems([...new Set(issues)]);
          setMessage({ tone: "bad", text: String(body.aborted) });
          return;
        }
        if (body.done) break;
      }

      // Both teams list the same fixture; orientation makes the key identical.
      const seen = new Set<string>();
      const unique = all.filter((r) => {
        const key = `${r.home}|${r.away}|${r.week}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setRows(unique);
      setProblems([...new Set(issues)]);
      setMessage({
        tone: issues.length ? "warn" : "good",
        text:
          `Fetched ${fetched} of ${total} team pages → ${unique.length} games ` +
          `after collapsing duplicates. ${weekSpread(unique)}`,
      });
    } catch (e) {
      // Whatever came back before the failure is still worth keeping.
      if (all.length) setRows(all);
      setProblems([...new Set(issues)]);
      setMessage({
        tone: "bad",
        text: `${e instanceof Error ? e.message : "Fetch failed."}${
          all.length ? ` Stopped after ${offset} of ${total} teams.` : ""
        }`,
      });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function diagnose() {
    const team = prompt(
      "Which team? Type the roster name exactly, e.g. Fairhope",
    );
    if (!team) return;
    setBusy(true);
    setDiag(null);
    try {
      const res = await fetch("/api/admin/import/ahsfhs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnose: team }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(String(body.error ?? "Diagnose failed."));
      setDiag(JSON.stringify(body, null, 2));
    } catch (e) {
      setDiag(e instanceof Error ? e.message : "Diagnose failed.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!rows) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/import/ahsfhs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ games: rows }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? "Import failed.");
      const spread = Object.entries(
        (body.byWeek ?? {}) as Record<string, number>,
      )
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([w, n]) => `wk${w} ${n}`)
        .join(" · ");
      const conflicts = (body.conflicts ?? []) as string[];
      setMessage({
        tone: conflicts.length ? "warn" : "good",
        text:
          `Sent ${body.received}, wrote ${body.imported}` +
          `${body.scored ? ` including ${body.scored} with scores` : ""}` +
          `${body.skippedAlreadyPlayed ? `, left ${body.skippedAlreadyPlayed} alone because they already have scores` : ""}` +
          `${body.collapsed ? `, collapsed ${body.collapsed} duplicate listings` : ""}` +
          `.${spread ? ` ${spread}.` : ""} Publish from the dashboard to update the site.`,
      });
      // Scores already on file are never overwritten; a disagreement is
      // reported so it can be settled by hand.
      if (conflicts.length) {
        setProblems([
          `${conflicts.length} game(s) already have a different score on file — left as they are:`,
          ...conflicts,
        ]);
      }
      setRows(null);
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Import failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <p className="text-sm" style={{ color: "rgb(var(--text-muted))" }}>
          Pulls whole-season schedules from ahsfhs.org, which carries games the
          AHSAA weekly PDFs leave out. Every fixture appears on both teams&rsquo;
          pages; home and away come from the &ldquo;@&rdquo; / &ldquo;vs.&rdquo;
          marker, so the duplicate collapses to one game. Scores already entered
          are never touched.
        </p>
        <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
          That site also lists AISA and defunct programs. Anything that does not
          match your roster is reported rather than imported.
        </p>
        <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
          Fetching a week asks only for the teams whose games that week are
          still unscored, and since both sides list the same fixture that is
          about one page per missing game &mdash; roughly half a full sweep,
          and far less once most results are in. Use &ldquo;all teams&rdquo;
          only when schedules themselves have changed.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn btn-primary"
            onClick={() => fetchAll(Number(week))}
            disabled={busy}
          >
            {busy ? "Fetching…" : `Fetch week ${week} scores`}
          </button>
          <input
            className="input !w-16"
            type="number"
            min={0}
            max={20}
            value={week}
            disabled={busy}
            onChange={(e) => setWeek(e.target.value)}
            aria-label="Week to fetch"
          />
          <button
            className="btn"
            onClick={() => fetchAll()}
            disabled={busy}
            title="Every team on the roster — only needed when schedules change"
          >
            Fetch all teams
          </button>
          {progress && (
            <span
              className="text-xs tnum"
              style={{ color: "rgb(var(--text-muted))" }}
            >
              {progress.done} / {progress.total} teams
            </span>
          )}
          <span className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
            or upload saved pages:
          </span>
          <input
            type="file"
            accept=".html,.htm,text/html"
            multiple
            className="text-sm"
            disabled={busy}
            onChange={(e) => e.target.files?.length && upload(e.target.files)}
          />
          <button className="btn !py-1.5 !text-xs" onClick={diagnose} disabled={busy}>
            Diagnose one team
          </button>
        </div>
      </div>

      {diag && (
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-bold">What the parser saw</h3>
            <button
              className="btn !py-1 !text-xs"
              onClick={() => navigator.clipboard?.writeText(diag)}
            >
              Copy
            </button>
          </div>
          <pre
            className="scroll-thin max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            {diag}
          </pre>
        </div>
      )}

      {message && <Banner tone={message.tone}>{message.text}</Banner>}

      {problems.length > 0 && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-bold">
            {problems.length} thing(s) to check
          </summary>
          <ul
            className="mt-2 space-y-1 text-xs"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            {problems.slice(0, 200).map((p, i) => (
              <li key={i}>• {p}</li>
            ))}
          </ul>
        </details>
      )}

      {rows && (
        <>
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
                  <th className="px-3 py-2 text-left">Wk</th>
                  <th className="px-3 py-2 text-left">Matchup</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 400).map((r, i) => (
                  <tr
                    key={i}
                    className="border-b last:border-0"
                    style={{ borderColor: "rgb(var(--border))" }}
                  >
                    <td className="px-3 py-2 text-xs tnum">{r.week}</td>
                    <td className="px-3 py-2 text-sm">
                      <span className="font-semibold">{r.home}</span>
                      <span style={{ color: "rgb(var(--text-faint))" }}>
                        {" vs "}
                      </span>
                      <span className="font-semibold">{r.away}</span>
                    </td>
                    {/* Visible before anything is written, so a misread score
                        is caught here rather than in the published ratings. */}
                    <td className="px-3 py-2 text-right text-sm font-bold tnum">
                      {r.homeScore !== null && r.awayScore !== null ? (
                        `${r.homeScore}–${r.awayScore}`
                      ) : (
                        <span style={{ color: "rgb(var(--text-faint))" }}>—</span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2 text-xs"
                      style={{ color: "rgb(var(--text-muted))" }}
                    >
                      {r.date ?? "—"}
                    </td>
                    <td
                      className="px-3 py-2 text-xs"
                      style={{ color: "rgb(var(--text-faint))" }}
                    >
                      {r.note ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 400 && (
            <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
              Showing the first 400 of {rows.length}. All of them import.
            </p>
          )}
          <button className="btn btn-primary" onClick={commit} disabled={busy}>
            {busy ? "Importing…" : `Import ${rows.length} games`}
          </button>
        </>
      )}
    </div>
  );
}
