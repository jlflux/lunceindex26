"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "./AdminShell";
import { Banner } from "./PublishButton";
import {
  COMPOSITE_SHOWN,
  COMPOSITE_SOURCES,
  COMPOSITE_RANKED,
} from "@/lib/rankings";

interface Row {
  team: string;
  maxpreps: string;
  massey: string;
  hsratings: string;
  ahsfhs: string;
}

const blank = (): Row => ({
  team: "",
  maxpreps: "",
  massey: "",
  hsratings: "",
  ahsfhs: "",
});

/** Our own rank, keyed by team, so the average can be shown while typing. */
export default function CompositeEditor({
  ourRank,
  ourRecord,
}: {
  ourRank: Record<string, number>;
  ourRecord: Record<string, string>;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/composite");
      const body = await res.json();
      if (!res.ok) {
        setMsg({ tone: "bad", text: body.error ?? "Could not load." });
        return;
      }
      setTeams(body.teams ?? []);
      const loaded: Row[] = (body.entries ?? []).map(
        (e: Record<string, unknown>) => ({
          team: String(e.team ?? ""),
          maxpreps: e.maxpreps == null ? "" : String(e.maxpreps),
          massey: e.massey == null ? "" : String(e.massey),
          hsratings: e.hsratings == null ? "" : String(e.hsratings),
          ahsfhs: e.ahsfhs == null ? "" : String(e.ahsfhs),
        }),
      );
      // Always leave room to reach thirty without hunting for an "add" button.
      while (loaded.length < COMPOSITE_SHOWN) loaded.push(blank());
      setRows(loaded);
    })();
  }, []);

  function set(i: number, key: keyof Row, value: string) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
    setMsg(null);
  }

  /** Live preview: the same rule the public board uses. */
  const preview = useMemo(() => {
    return rows.map((r) => {
      const ours = ourRank[r.team];
      const nums = [
        ours,
        ...COMPOSITE_SOURCES.map(({ key }) => {
          const v = r[key];
          return v === "" ? undefined : Number(v);
        }),
      ];
      const have = nums.filter((n) => typeof n === "number" && !Number.isNaN(n));
      const complete = have.length === nums.length;
      return {
        average: complete
          ? (have as number[]).reduce((a, b) => a + b, 0) / have.length
          : null,
        have: have.length,
      };
    });
  }, [rows, ourRank]);

  // Position on the board, so the editor shows the order it will publish in.
  const order = useMemo(() => {
    const idx = preview
      .map((p, i) => ({ i, avg: p.average }))
      .filter((x) => x.avg !== null)
      .sort((a, b) => (a.avg as number) - (b.avg as number));
    const m = new Map<number, number>();
    idx.forEach((x, n) => m.set(x.i, n + 1));
    return m;
  }, [preview]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/composite", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: rows.filter((r) => r.team.trim()) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed.");
      setMsg({
        tone: "good",
        text: `Saved ${body.saved} teams. The Composite page updates within five minutes.`,
      });
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setBusy(false);
    }
  }

  const complete = preview.filter((p) => p.average !== null).length;

  return (
    <div className="space-y-5">
      <AdminHeader
        title="Composite"
        subtitle={`Our rank and four outside polls, averaged. A team needs a number in all five to be ranked — the top ${COMPOSITE_RANKED} make the board and the next few show as just missing.`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save board"}
        </button>
        <button
          className="btn !py-1.5 !text-xs"
          onClick={() => setRows((rs) => [...rs, blank()])}
        >
          Add a row
        </button>
        <span className="text-xs tnum" style={{ color: "rgb(var(--text-muted))" }}>
          {complete} of {rows.filter((r) => r.team.trim()).length} complete
        </span>
      </div>

      {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}

      <datalist id="composite-teams">
        {teams.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="card table-scroll">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr
              className="border-b text-[10px] uppercase tracking-wider"
              style={{
                borderColor: "rgb(var(--border))",
                color: "rgb(var(--text-faint))",
              }}
            >
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Team</th>
              <th className="px-2 py-2 text-center">Record</th>
              <th className="px-2 py-2 text-center">Ours</th>
              {COMPOSITE_SOURCES.map((s) => (
                <th key={s.key} className="px-2 py-2 text-center">
                  {s.label}
                </th>
              ))}
              <th className="px-2 py-2 text-right">Avg</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = preview[i];
              const pos = order.get(i);
              const named = r.team.trim().length > 0;
              const unknownTeam = named && teams.length > 0 && !teams.includes(r.team);
              return (
                <tr
                  key={i}
                  className="border-b last:border-0"
                  style={{
                    borderColor: "rgb(var(--border))",
                    background:
                      pos && pos <= COMPOSITE_RANKED
                        ? "rgb(var(--brand) / 0.04)"
                        : undefined,
                  }}
                >
                  <td
                    className="px-2 py-1 text-xs font-bold tnum"
                    style={{ color: "rgb(var(--text-faint))" }}
                  >
                    {pos ?? ""}
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="input !py-1 !text-xs"
                      list="composite-teams"
                      value={r.team}
                      placeholder="Team"
                      onChange={(e) => set(i, "team", e.target.value)}
                      style={
                        unknownTeam
                          ? { borderColor: "rgb(var(--bad))" }
                          : undefined
                      }
                    />
                  </td>
                  <td
                    className="px-2 py-1 text-center text-xs tnum"
                    style={{ color: "rgb(var(--text-muted))" }}
                  >
                    {ourRecord[r.team] ?? "—"}
                  </td>
                  <td className="px-2 py-1 text-center text-xs font-semibold tnum">
                    {ourRank[r.team] ?? "—"}
                  </td>
                  {COMPOSITE_SOURCES.map((s) => (
                    <td key={s.key} className="px-2 py-1">
                      <input
                        className="input !w-16 !py-1 text-center !text-xs"
                        inputMode="numeric"
                        value={r[s.key]}
                        onChange={(e) => set(i, s.key, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right text-xs font-bold tnum">
                    {p?.average != null ? (
                      p.average.toFixed(2)
                    ) : (
                      <span
                        title={`${p?.have ?? 0} of 5 polls filled in`}
                        style={{ color: "rgb(var(--text-faint))" }}
                      >
                        {named ? `${p?.have ?? 0}/5` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {named && (
                      <button
                        className="btn !px-2 !py-0.5 !text-[11px]"
                        onClick={() =>
                          setRows((rs) => rs.filter((_, j) => j !== i))
                        }
                        title="Remove this team"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
        Our own rank and the record are filled in from the published board, so
        they never need typing and cannot drift out of step with it. A row
        showing <strong>4/5</strong> is missing one poll and will not be ranked
        until it has all five.
      </p>
    </div>
  );
}
