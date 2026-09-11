"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "./AdminShell";
import { Banner } from "./PublishButton";
import { ASWA_TOP } from "@/lib/rankings";
import { CLS_FILTER_ORDER, type Classification } from "@/lib/types";

interface Row {
  rank: string;
  team: string;
  wins: string;
  losses: string;
  first_votes: string;
  points: string;
}

const blank = (rank = ""): Row => ({
  rank,
  team: "",
  wins: "",
  losses: "",
  first_votes: "",
  points: "",
});

/** Ten ranked slots plus room for the also-rans underneath. */
const OTHERS_SLOTS = 6;

function fresh(): Row[] {
  return [
    ...Array.from({ length: ASWA_TOP }, (_, i) => blank(String(i + 1))),
    ...Array.from({ length: OTHERS_SLOTS }, () => blank()),
  ];
}

export default function AswaEditor({
  records,
}: {
  /** Overall record per team, so the poll's W-L does not need typing. */
  records: Record<string, string>;
}) {
  const [cls, setCls] = useState<Classification>(CLS_FILTER_ORDER[0]);
  const [all, setAll] = useState<Record<string, Row[]>>({});
  const [teams, setTeams] = useState<{ name: string; classification: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/aswa");
      const body = await res.json();
      if (!res.ok) {
        setMsg({ tone: "bad", text: body.error ?? "Could not load." });
        return;
      }
      setTeams(body.teams ?? []);
      const grouped: Record<string, Row[]> = {};
      for (const c of CLS_FILTER_ORDER) grouped[c] = fresh();
      for (const e of body.entries ?? []) {
        const rows = grouped[e.classification];
        if (!rows) continue;
        const row: Row = {
          rank: e.rank == null ? "" : String(e.rank),
          team: String(e.team ?? ""),
          wins: String(e.wins ?? ""),
          losses: String(e.losses ?? ""),
          first_votes: e.first_votes ? String(e.first_votes) : "",
          points: e.points ? String(e.points) : "",
        };
        // A ranked team goes in its own slot; the rest fill the tail in order.
        const slot = e.rank ? Number(e.rank) - 1 : rows.findIndex((r, i) => i >= ASWA_TOP && !r.team);
        if (slot >= 0 && slot < rows.length) rows[slot] = row;
        else rows.push(row);
      }
      setAll(grouped);
    })();
  }, []);

  const rows = all[cls] ?? fresh();

  function set(i: number, key: keyof Row, value: string) {
    setAll((a) => ({
      ...a,
      [cls]: (a[cls] ?? fresh()).map((r, j) =>
        j === i ? { ...r, [key]: value } : r,
      ),
    }));
    setMsg(null);
  }

  const inClass = useMemo(
    () => teams.filter((t) => t.classification === cls).map((t) => t.name).sort(),
    [teams, cls],
  );

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/aswa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classification: cls,
          entries: rows
            .filter((r) => r.team.trim())
            .map((r) => ({
              ...r,
              // The record is taken from the board unless it was typed over.
              wins: r.wins === "" ? (records[r.team] ?? "-").split("-")[0] : r.wins,
              losses: r.losses === "" ? (records[r.team] ?? "--").split("-")[1] : r.losses,
            })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed.");
      setMsg({
        tone: "good",
        text: `Saved Class ${cls} — ${body.saved} teams. The ASWA page updates within five minutes.`,
      });
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setBusy(false);
    }
  }

  const filled = rows.filter((r) => r.team.trim()).length;

  return (
    <div className="space-y-5">
      <AdminHeader
        title="ASWA Poll"
        subtitle="The Alabama Sports Writers Association top ten in each classification, with first-place votes and total points. Saved one class at a time, the way the poll is released."
      />

      <div className="table-scroll scroll-thin">
        <div className="flex items-center gap-1.5">
          <span
            className="mr-1 shrink-0 text-[10.5px] font-bold uppercase tracking-wider"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            Class
          </span>
          {CLS_FILTER_ORDER.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCls(c);
                setMsg(null);
              }}
              className={`pill ${cls === c ? "pill-active" : ""}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : `Save Class ${cls}`}
        </button>
        <button
          className="btn !py-1.5 !text-xs"
          onClick={() =>
            setAll((a) => ({ ...a, [cls]: [...(a[cls] ?? fresh()), blank()] }))
          }
        >
          Add a row
        </button>
        <span className="text-xs tnum" style={{ color: "rgb(var(--text-muted))" }}>
          {filled} team{filled === 1 ? "" : "s"} in {cls}
        </span>
      </div>

      {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}

      <datalist id={`aswa-teams-${cls}`}>
        {inClass.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="card table-scroll">
        <table className="w-full min-w-[680px]">
          <thead>
            <tr
              className="border-b text-[10px] uppercase tracking-wider"
              style={{
                borderColor: "rgb(var(--border))",
                color: "rgb(var(--text-faint))",
              }}
            >
              <th className="px-2 py-2 text-left">Rank</th>
              <th className="px-2 py-2 text-left">Team</th>
              <th className="px-2 py-2 text-center">W</th>
              <th className="px-2 py-2 text-center">L</th>
              <th className="px-2 py-2 text-center">1st</th>
              <th className="px-2 py-2 text-center">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isOthers = i >= ASWA_TOP;
              const unknown =
                r.team.trim() && inClass.length > 0 && !inClass.includes(r.team);
              return (
                <tr
                  key={i}
                  className="border-b last:border-0"
                  style={{
                    borderColor: "rgb(var(--border))",
                    background: isOthers ? "rgb(var(--surface-2))" : undefined,
                  }}
                >
                  <td className="px-2 py-1">
                    {isOthers ? (
                      <span
                        className="text-[10px] uppercase tracking-wide"
                        style={{ color: "rgb(var(--text-faint))" }}
                      >
                        Also
                      </span>
                    ) : (
                      <span className="text-xs font-bold tnum">{r.rank}</span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="input !py-1 !text-xs"
                      list={`aswa-teams-${cls}`}
                      value={r.team}
                      placeholder={isOthers ? "Also received votes" : "Team"}
                      onChange={(e) => set(i, "team", e.target.value)}
                      style={unknown ? { borderColor: "rgb(var(--bad))" } : undefined}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="input !w-14 !py-1 text-center !text-xs"
                      inputMode="numeric"
                      placeholder={(records[r.team] ?? "").split("-")[0] ?? ""}
                      value={r.wins}
                      onChange={(e) => set(i, "wins", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="input !w-14 !py-1 text-center !text-xs"
                      inputMode="numeric"
                      placeholder={(records[r.team] ?? "").split("-")[1] ?? ""}
                      value={r.losses}
                      onChange={(e) => set(i, "losses", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="input !w-14 !py-1 text-center !text-xs"
                      inputMode="numeric"
                      value={r.first_votes}
                      onChange={(e) => set(i, "first_votes", e.target.value)}
                      disabled={isOthers}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="input !w-16 !py-1 text-center !text-xs"
                      inputMode="numeric"
                      value={r.points}
                      onChange={(e) => set(i, "points", e.target.value)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
        Rows under the ten are the &ldquo;others receiving votes&rdquo; line.
        Leaving W and L blank fills them from the published board — the greyed
        number in each box is what will be used.
      </p>
    </div>
  );
}
