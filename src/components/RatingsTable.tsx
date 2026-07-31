"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "./Icon";
import { fmt, fmtPct, fmtSigned, ordinal, record } from "@/lib/format";
import {
  CLS_FILTER_ORDER,
  type Classification,
  type RatingRow,
  type RpiRow,
} from "@/lib/types";

type Mode = "index" | "rpi";

/**
 * Ranks within each numeric column, so a team's rating can be read against
 * the field — this is the one thing the old site did that a plain table
 * loses. Computed once per dataset, not per render of a row.
 */
function columnRanks<T>(rows: T[], get: (r: T) => number, higherIsBetter = true) {
  const order = rows
    .map((r, i) => ({ i, v: get(r) }))
    .sort((a, b) => (higherIsBetter ? b.v - a.v : a.v - b.v));
  const ranks = new Array<number>(rows.length);
  order.forEach((o, idx) => (ranks[o.i] = idx + 1));
  return ranks;
}

export default function RatingsTable({
  mode,
  ratings,
  rpi,
  initialClass = "all",
}: {
  mode: Mode;
  ratings: RatingRow[];
  rpi: RpiRow[];
  initialClass?: Classification | "all";
}) {
  const [cls, setCls] = useState<Classification | "all">(initialClass);
  const [region, setRegion] = useState<number | "all">("all");
  const [query, setQuery] = useState("");

  const source = mode === "index" ? ratings : rpi;
  const played = mode === "index" ? ratings.filter((r) => r.wins + r.losses > 0) : [];

  // Column ranks come from the full field, so filtering to 3A still shows a
  // team's standing among all 393 rather than among its class.
  const ranks = useMemo(() => {
    if (mode !== "index") return null;
    const rs = ratings;
    return {
      sos: columnRanks(rs, (r) => r.sos),
      oEff: columnRanks(rs, (r) => r.o_eff),
      dEff: columnRanks(rs, (r) => r.d_eff),
      ppg: columnRanks(rs, (r) => r.ppg),
      papg: columnRanks(rs, (r) => r.papg, false),
      index: new Map(rs.map((r, i) => [r.slug, i])),
    };
  }, [mode, ratings]);

  const regions = useMemo(() => {
    if (cls === "all") return [];
    return [
      ...new Set(source.filter((r) => r.classification === cls).map((r) => r.region)),
    ].sort((a, b) => a - b);
  }, [source, cls]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return source.filter((r) => {
      if (cls !== "all" && r.classification !== cls) return false;
      if (region !== "all" && r.region !== region) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [source, cls, region, query]);

  const scoped = cls !== "all";
  const hasResults = played.length > 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            <Icon name="search" size={15} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams…"
            className="input !pl-9"
            aria-label="Search teams"
          />
        </div>

        <div className="table-scroll scroll-thin -mx-4 px-4 lg:mx-0 lg:flex-1 lg:px-0">
          <div className="flex gap-1.5 pb-0.5">
            <Chip
              active={cls === "all"}
              onClick={() => {
                setCls("all");
                setRegion("all");
              }}
              label="All"
            />
            {CLS_FILTER_ORDER.map((c) => (
              <Chip
                key={c}
                active={cls === c}
                onClick={() => {
                  setCls(c);
                  setRegion("all");
                }}
                label={c}
              />
            ))}
          </div>
        </div>
      </div>

      {regions.length > 0 && (
        <div className="table-scroll scroll-thin -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1.5 pb-0.5">
            <Chip
              active={region === "all"}
              onClick={() => setRegion("all")}
              label="All regions"
            />
            {regions.map((r) => (
              <Chip
                key={r}
                active={region === r}
                onClick={() => setRegion(r)}
                label={`Region ${r}`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
          <span className="font-semibold" style={{ color: "rgb(var(--text))" }}>
            {rows.length}
          </span>{" "}
          team{rows.length === 1 ? "" : "s"}
          {scoped && ` · ranked within ${cls}`}
        </p>
        {mode === "index" && !hasResults && (
          <span className="chip" style={{ background: "rgb(var(--warn-soft))", color: "rgb(var(--warn))" }}>
            Preseason — no games played
          </span>
        )}
      </div>

      <div className="card table-scroll scroll-thin overflow-hidden">
        <table className={`w-full ${hasResults || mode === "rpi" ? "min-w-[780px]" : "min-w-[560px]"}`}>
          <thead>
            <tr
              className="border-b"
              style={{
                borderColor: "rgb(var(--border))",
                background: "rgb(var(--surface-2))",
              }}
            >
              <th className="th w-14 !text-center">#</th>
              <th className="th">Team</th>
              {mode === "index" ? (
                <>
                  <th className="th !text-right">Rating</th>
                  <th className="th !text-center">In class</th>
                  <th className="th !text-center">Rec</th>
                  {/* Every one of these reads "—" before a game is played.
                      Hiding them keeps the preseason board legible; they
                      return the moment there are results. */}
                  {hasResults && (
                    <>
                      <th className="th !text-right">SOS</th>
                      <th className="th !text-right">Off</th>
                      <th className="th !text-right">Def</th>
                      <th className="th hidden !text-right lg:table-cell">PF/G</th>
                      <th className="th hidden !text-right lg:table-cell">PA/G</th>
                    </>
                  )}
                </>
              ) : (
                <>
                  <th className="th !text-right">RPI</th>
                  <th className="th !text-center">In class</th>
                  <th className="th !text-center">Rec</th>
                  <th className="th !text-right">Win%</th>
                  <th className="th !text-right">OWP</th>
                  <th className="th hidden !text-right sm:table-cell">OOWP</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const idx = ranks?.index.get(r.slug);
              const ir = mode === "index" ? (r as RatingRow) : null;
              const rr = mode === "rpi" ? (r as RpiRow) : null;
              const hasGames = r.wins + r.losses > 0;

              return (
                <tr
                  key={r.slug}
                  className="row-hover border-b transition-colors last:border-0"
                  style={{ borderColor: "rgb(var(--border))" }}
                >
                  <td className="td !text-center">
                    <RankBadge n={scoped ? r.class_rank : r.rank} />
                  </td>

                  <td className="td !whitespace-nowrap">
                    <Link
                      href={`/team/${r.slug}`}
                      className="text-[13.5px] font-semibold hover:underline"
                    >
                      {r.name}
                    </Link>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={`chip cls-${r.classification}`}>
                        {r.classification}
                      </span>
                      <span
                        className="text-[11px]"
                        style={{ color: "rgb(var(--text-faint))" }}
                      >
                        Region {r.region}
                      </span>
                    </div>
                  </td>

                  {ir && ranks && idx !== undefined ? (
                    <>
                      <td className="td !text-right">
                        <span className="text-[15px] font-bold">
                          {fmt(ir.rating)}
                        </span>
                      </td>
                      <ClassRankCell
                        rank={ir.class_rank}
                        cls={ir.classification}
                      />
                      <td
                        className="td !text-center"
                        style={{ color: "rgb(var(--text-muted))" }}
                      >
                        {record(ir.wins, ir.losses)}
                      </td>
                      {hasResults && (
                        <>
                          <Cell
                            value={hasGames ? fmt(ir.sos) : "—"}
                            rank={hasGames ? ranks.sos[idx] : undefined}
                          />
                          <Cell
                            value={hasGames ? fmtSigned(ir.o_eff) : "—"}
                            rank={hasGames ? ranks.oEff[idx] : undefined}
                            tone={hasGames ? ir.o_eff : undefined}
                          />
                          <Cell
                            value={hasGames ? fmtSigned(ir.d_eff) : "—"}
                            rank={hasGames ? ranks.dEff[idx] : undefined}
                            tone={hasGames ? ir.d_eff : undefined}
                          />
                          <Cell
                            className="hidden lg:table-cell"
                            value={hasGames ? fmt(ir.ppg, 1) : "—"}
                            rank={hasGames ? ranks.ppg[idx] : undefined}
                          />
                          <Cell
                            className="hidden lg:table-cell"
                            value={hasGames ? fmt(ir.papg, 1) : "—"}
                            rank={hasGames ? ranks.papg[idx] : undefined}
                          />
                        </>
                      )}
                    </>
                  ) : rr ? (
                    <>
                      <td className="td !text-right">
                        <span className="text-[15px] font-bold">
                          {rr.rpi.toFixed(4)}
                        </span>
                      </td>
                      <ClassRankCell
                        rank={rr.class_rank}
                        cls={rr.classification}
                      />
                      <td
                        className="td !text-center"
                        style={{ color: "rgb(var(--text-muted))" }}
                      >
                        {record(rr.wins, rr.losses)}
                      </td>
                      <Cell value={hasGames ? fmtPct(rr.win_pct) : "—"} />
                      <Cell value={hasGames ? fmtPct(rr.opp_win_pct) : "—"} />
                      <Cell
                        className="hidden sm:table-cell"
                        value={hasGames ? fmtPct(rr.opp_opp_win_pct) : "—"}
                      />
                    </>
                  ) : null}
                </tr>
              );
            })}

            {!rows.length && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-16 text-center text-sm"
                  style={{ color: "rgb(var(--text-faint))" }}
                >
                  No teams match those filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A team's standing inside its own classification, e.g. "2nd in 5A". */
function ClassRankCell({
  rank,
  cls,
}: {
  rank: number;
  cls: Classification;
}) {
  return (
    <td className="td !text-center">
      <span className="text-[12.5px] font-semibold tnum">{ordinal(rank)}</span>
      <span
        className="ml-1 text-[11px]"
        style={{ color: "rgb(var(--text-faint))" }}
      >
        {cls}
      </span>
    </td>
  );
}

function RankBadge({ n }: { n: number }) {
  const top = n <= 3;
  return (
    <span
      className="inline-grid h-[26px] min-w-[26px] place-items-center rounded-md px-1.5 text-[12.5px] font-semibold tnum"
      style={
        top
          ? { color: "rgb(var(--brand))", fontWeight: 700 }
          : { color: "rgb(var(--text-faint))" }
      }
    >
      {n}
    </span>
  );
}

/** Numeric cell with the old site's parenthetical field rank underneath. */
function Cell({
  value,
  rank,
  tone,
  className = "",
}: {
  value: string;
  rank?: number;
  tone?: number;
  className?: string;
}) {
  const color =
    tone === undefined
      ? "rgb(var(--text))"
      : tone > 0.5
        ? "rgb(var(--good))"
        : tone < -0.5
          ? "rgb(var(--bad))"
          : "rgb(var(--text-muted))";

  return (
    <td className={`td !text-right ${className}`}>
      <span className="font-semibold" style={{ color }}>
        {value}
      </span>
      {rank !== undefined && (
        <span
          className="ml-1 text-[10px] font-medium"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          #{rank}
        </span>
      )}
    </td>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`pill ${active ? "pill-active" : ""}`}
    >
      {label}
    </button>
  );
}
