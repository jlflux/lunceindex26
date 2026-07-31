"use client";

import { useState } from "react";
import { Banner } from "./PublishButton";
import type { ScoreRow } from "@/lib/score-csv";
import { PLAYOFF_ROUND_LABELS, type PlayoffRound } from "@/lib/types";

const ROUNDS = Object.keys(PLAYOFF_ROUND_LABELS) as PlayoffRound[];

type Mode = "scores" | "schedule";

export default function ImportManager() {
  const [mode, setMode] = useState<Mode>("scores");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-extrabold tracking-tight">Import</h1>

      <div
        className="flex gap-1 rounded-xl p-1"
        style={{ background: "rgb(var(--surface-2))" }}
      >
        {(
          [
            ["scores", "Weekly scores (CSV)"],
            ["schedule", "Schedule (AHSAA PDF)"],
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

      {mode === "scores" ? <ScoreImport /> : <ScheduleImport />}
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
      const body = await res.json();
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
      const body = await res.json();
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
      const body = await res.json();
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
      const body = await res.json();
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
