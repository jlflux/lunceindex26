"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "./Icon";
import type { ClassOdds, OddsReport, TeamOdds } from "@/lib/playoffs";
import { CLS_FILTER_ORDER, type Classification } from "@/lib/types";

/**
 * The odds board.
 *
 * One classification at a time, because the columns genuinely differ between
 * them — a four-region class plays one round fewer than an eight-region class,
 * so a single table would either invent a round or drop one.
 *
 * Every cell is shaded by its own value. A page of three-figure percentages is
 * unreadable as numbers alone; the shading is what lets a reader find the
 * contenders in a sixty-team classification without reading a single figure.
 */
export default function OddsBoard({ report }: { report: OddsReport }) {
  const available = useMemo(
    () =>
      CLS_FILTER_ORDER.filter((c) =>
        report.classes.some((x) => x.classification === c),
      ),
    [report],
  );
  const [cls, setCls] = useState<Classification>(available[0] ?? "6A");
  const [query, setQuery] = useState("");

  const block =
    report.classes.find((c) => c.classification === cls) ?? report.classes[0];
  if (!block) return null;

  const q = query.trim().toLowerCase();
  const rows = q
    ? block.teams.filter((t) => t.name.toLowerCase().includes(q))
    : block.teams;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border px-3 py-3 lg:flex-row lg:items-center"
        style={{ background: "rgb(var(--surface))", borderColor: "rgb(var(--border))" }}>
        <div className="relative lg:w-64">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            <Icon name="search" size={15} />
          </span>
          <input
            className="input !pl-9"
            type="search"
            placeholder="Search teams…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="table-scroll scroll-thin -mx-1 px-1">
          <div className="flex items-center gap-1.5">
            <span
              className="mr-1 shrink-0 text-[10.5px] font-bold uppercase tracking-wider"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              Class
            </span>
            {available.map((c) => (
              <button
                key={c}
                onClick={() => setCls(c)}
                className={`pill ${cls === c ? "pill-active" : ""}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <span
          className="ml-auto shrink-0 text-xs tnum"
          style={{ color: "rgb(var(--text-muted))" }}
        >
          {block.regions} regions · {block.qualifiers * block.regions} qualify
        </span>
      </div>

      <ClassTable block={block} rows={rows} />

      <Legend />
    </div>
  );
}

function ClassTable({ block, rows }: { block: ClassOdds; rows: TeamOdds[] }) {
  return (
    <div className="card table-scroll">
      <table className="w-full min-w-[840px]">
        <thead>
          <tr
            className="border-b"
            style={{
              borderColor: "rgb(var(--border))",
              background: "rgb(var(--surface-2))",
            }}
          >
            <th className="th !px-2">Team</th>
            <th className="th !text-center">Region</th>
            <th className="th !text-center">Playoffs</th>
            {[1, 2, 3, 4].slice(0, block.qualifiers).map((s) => (
              <th key={s} className="th !text-center" title={`Finishes ${s} in its region`}>
                {s === 1 ? "1 seed" : `${s}`}
              </th>
            ))}
            {block.roundNames.map((n) => (
              <th key={n} className="th !text-center" title={`Wins the ${n}`}>
                {shortRound(n)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr
              key={t.slug}
              className="border-b last:border-0"
              style={{
                borderColor: "rgb(var(--border) / 0.7)",
                opacity: t.eliminated ? 0.45 : 1,
              }}
            >
              <td className={`td !px-2 stripe-${t.classification}`}>
                <Link
                  href={`/team/${t.slug}`}
                  className="text-[13.5px] font-semibold hover:underline"
                >
                  {t.name}
                </Link>
                {t.clinched && <Flag kind="x" />}
                {t.eliminated && <Flag kind="e" />}
              </td>
              <td
                className="td !text-center text-[12px] tnum"
                style={{ color: "rgb(var(--text-muted))" }}
              >
                {t.region_w}-{t.region_l}
                <span className="ml-1 text-[10.5px]" style={{ color: "rgb(var(--text-faint))" }}>
                  R{t.region}
                </span>
              </td>
              <Pct v={t.playoff} strong />
              {t.seeds.slice(0, block.qualifiers).map((p, i) => (
                <Pct key={i} v={p} />
              ))}
              {t.rounds.map((p, i) => (
                <Pct key={i} v={p} title={i === t.rounds.length - 1} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A percentage, shaded by itself.
 *
 * The ramp is deliberately not linear. Most of a sixty-team classification
 * sits under ten percent, and a linear ramp renders all of it as the same
 * near-empty wash — the square root pulls the low end apart, which is where
 * the reading actually happens.
 */
function Pct({
  v,
  strong,
  title,
}: {
  v: number;
  strong?: boolean;
  title?: boolean;
}) {
  const shown = v >= 0.9995 ? "100" : v <= 0 ? "—" : (v * 100).toFixed(v < 0.095 ? 1 : 0);
  const a = Math.sqrt(Math.max(0, Math.min(1, v)));
  const hue = title ? "var(--brand)" : "var(--rating)";
  return (
    <td
      className="td !px-1 !text-center"
      style={{ background: v > 0 ? `rgb(${hue} / ${(a * 0.26).toFixed(3)})` : undefined }}
    >
      <span
        className={`text-[12.5px] tnum ${strong || v >= 0.5 ? "font-bold" : "font-medium"}`}
        style={{
          color:
            v <= 0
              ? "rgb(var(--text-faint))"
              : v >= 0.35
                ? `rgb(${hue})`
                : "rgb(var(--text))",
        }}
      >
        {shown}
        {v > 0 && <span className="text-[9px] opacity-55">%</span>}
      </span>
    </td>
  );
}

function Flag({ kind }: { kind: "x" | "e" }) {
  return (
    <span
      className="ml-1.5 rounded px-1 py-0.5 text-[9.5px] font-bold uppercase"
      style={
        kind === "x"
          ? { background: "rgb(var(--good-soft))", color: "rgb(var(--good))" }
          : { background: "rgb(var(--surface-3))", color: "rgb(var(--text-faint))" }
      }
      title={
        kind === "x"
          ? "Clinched a playoff place — cannot be caught by five teams in its region"
          : "Eliminated — cannot finish in its region's top four"
      }
    >
      {kind}
    </span>
  );
}

function Legend() {
  return (
    <p className="text-xs leading-relaxed" style={{ color: "rgb(var(--text-faint))" }}>
      <strong style={{ color: "rgb(var(--good))" }}>x</strong> clinched a
      playoff place · <strong>e</strong> eliminated. Both are proved from the
      games left to play rather than read off the simulation, so neither can be
      wrong. Everything else is a share of ten thousand simulated seasons and
      carries about half a point of sampling noise. A dash means it did not
      happen in any of them.
    </p>
  );
}

/** "Quarterfinals" does not fit a column head on a phone. */
function shortRound(n: string): string {
  return (
    {
      "First Round": "1st Rd",
      "Second Round": "2nd Rd",
      Quarterfinals: "Quarters",
      Semifinals: "Semis",
      Championship: "Title",
    }[n] ?? n
  );
}
