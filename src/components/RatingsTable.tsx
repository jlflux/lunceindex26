"use client";

import { Fragment, useMemo, useState } from "react";
import Icon from "./Icon";
import TeamPanel from "./TeamPanel";
import {
  MIN_GAMES_FOR_EFFICIENCY,
  MIN_GAMES_FOR_SPLIT,
  SHOW_EFFICIENCY,
  fmt,
  fmtPct,
  fmtSigned,
  record,
} from "@/lib/format";
import {
  CLS_FILTER_ORDER,
  type Classification,
  type RatingRow,
  type RatingsPayload,
  type RpiRow,
} from "@/lib/types";

type Mode = "index" | "rpi" | "resume";

/**
 * Rank within a numeric column across the whole field, so a figure can be read
 * against the other 392 rather than in isolation. Keyed by slug because the
 * table is filtered and re-sorted constantly.
 */
function columnRank<T extends { slug: string }>(
  rows: T[],
  get: (r: T) => number,
  higherIsBetter = true,
) {
  const m = new Map<string, number>();
  if (!rows.length) return m;

  const values = rows.map(get);
  // A column where every team holds the same figure has no ordering in it.
  // After a single week that is exactly what efficiency looks like: your
  // opponent's only points-allowed figure is what you scored on them, so it
  // cancels to zero for everybody. Numbering that 1 to 393 invents a ladder
  // out of array order.
  if (Math.min(...values) === Math.max(...values)) return m;

  const sorted = [...rows].sort((a, b) =>
    higherIsBetter ? get(b) - get(a) : get(a) - get(b),
  );
  // Equal figures share a rank, rather than being separated by whichever the
  // sort happened to put first.
  let rank = 1;
  sorted.forEach((r, i) => {
    if (i > 0 && get(r) !== get(sorted[i - 1])) rank = i + 1;
    m.set(r.slug, rank);
  });
  return m;
}

/** How much of the board gets the highlight treatment. */
const HIGHLIGHT_OVERALL = 25;
const HIGHLIGHT_IN_CLASS = 10;

/**
 * Where a rating sits across the whole field, 0–1.
 *
 * Scaled from the field minimum rather than from zero: ratings at the top of
 * the board cluster within a few points of each other, so measuring against
 * zero gives every leader a near-full bar and shows nothing.
 */
function meterScale(all: { rating: number }[]) {
  const vals = all.map((r) => r.rating);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo;
  return (v: number) => (span > 0 ? Math.max(0, (v - lo) / span) : 0);
}

export default function RatingsTable({
  mode,
  payload,
  initialClass = "all",
}: {
  mode: Mode;
  payload: RatingsPayload;
  initialClass?: Classification | "all";
}) {
  const { ratings, rpi } = payload;
  const [cls, setCls] = useState<Classification | "all">(initialClass);
  const [region, setRegion] = useState<number | "all">("all");
  const [query, setQuery] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const hasResults = ratings.some((r) => r.wins + r.losses > 0);
  // The adjusted split only exists on boards built by the two-way engine.
  const hasSplit = ratings.some((r) => typeof r.adj_o === "number");

  /**
   * The résumé board is the same teams in a different order, so it is derived
   * here rather than carried separately in the payload. Teams with no games
   * are dropped: a résumé of nothing is not a zero, it is an absence.
   */
  const resumeRows = useMemo(() => {
    const played = ratings.filter((r) => r.wins + r.losses > 0);
    const sorted = [...played].sort((a, b) => (b.sor ?? 0) - (a.sor ?? 0));
    const seen = new Map<string, number>();
    return sorted.map((r, i) => {
      const n = (seen.get(r.classification) ?? 0) + 1;
      seen.set(r.classification, n);
      return { ...r, rank: i + 1, class_rank: n };
    });
  }, [ratings]);

  const source =
    mode === "index" ? ratings : mode === "resume" ? resumeRows : rpi;

  const ranks = useMemo(
    () => ({
      sos: columnRank(ratings, (r) => r.sos),
      oEff: columnRank(ratings, (r) => r.o_eff),
      dEff: columnRank(ratings, (r) => r.d_eff),
      adjO: columnRank(ratings, (r) => r.adj_o ?? 0),
      adjD: columnRank(ratings, (r) => r.adj_d ?? 0, false),
      ppg: columnRank(ratings, (r) => r.ppg),
      papg: columnRank(ratings, (r) => r.papg, false),
    }),
    [ratings],
  );

  const regions = useMemo(() => {
    if (cls === "all") return [];
    return [
      ...new Set(
        source.filter((r) => r.classification === cls).map((r) => r.region),
      ),
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
  const cutoff = scoped ? HIGHLIGHT_IN_CLASS : HIGHLIGHT_OVERALL;
  // Always off the full Index field: the meter only appears in index mode, and
  // it should read against every team rather than the current filter.
  const scale = useMemo(() => meterScale(ratings), [ratings]);

  return (
    <>
      {/* Toolbar */}
      <div
        className="mb-4 flex flex-col gap-3 rounded-xl border px-3 py-3 lg:flex-row lg:items-center"
        style={{
          background: "rgb(var(--surface))",
          borderColor: "rgb(var(--border))",
        }}
      >
        <div className="relative lg:w-64">
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
            style={{ background: "rgb(var(--surface-2))" }}
          />
        </div>

        <div className="table-scroll scroll-thin min-w-0 lg:flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className="mr-1 shrink-0 text-[10.5px] font-bold uppercase tracking-wider"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              Class
            </span>
            <Pill
              active={cls === "all"}
              onClick={() => {
                setCls("all");
                setRegion("all");
              }}
              label="All"
            />
            {CLS_FILTER_ORDER.map((c) => (
              <Pill
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

        <span
          className="shrink-0 text-[12px] tnum"
          style={{ color: "rgb(var(--text-muted))" }}
        >
          {rows.length} teams
        </span>
      </div>

      {regions.length > 0 && (
        <div className="table-scroll scroll-thin mb-4">
          <div className="flex gap-1.5">
            <Pill
              active={region === "all"}
              onClick={() => setRegion("all")}
              label="All regions"
            />
            {regions.map((r) => (
              <Pill
                key={r}
                active={region === r}
                onClick={() => setRegion(r)}
                label={`Region ${r}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div
        className="table-scroll scroll-thin overflow-hidden rounded-xl border"
        style={{ borderColor: "rgb(var(--border))" }}
      >
        {/* The wide layout only kicks in once there is room for it. Forcing a
            880px minimum on a phone produced a board that could not be scrolled
            sideways at all, leaving the rating off-screen and unreachable. */}
        <table className="w-full md:min-w-[880px]">
          <thead>
            <tr
              className="border-b"
              style={{
                borderColor: "rgb(var(--border))",
                background: "rgb(var(--surface-2))",
              }}
            >
              <th className="th w-11 !px-2 !text-center sm:w-14 sm:!px-3">#</th>
              <th className="th !px-2 sm:!px-3">Team</th>
              <th className="th hidden !text-center sm:table-cell">Record</th>
              {mode === "index" ? (
                <>
                  <th className="th hidden !text-right md:table-cell">SOS</th>
                  {hasSplit && (
                    <>
                      <th
                        className="th hidden !text-right md:table-cell"
                        title="Points this team would score on an average AHSAA defence"
                      >
                        Adj O
                      </th>
                      <th
                        className="th hidden !text-right md:table-cell"
                        title="Points this team would allow to an average AHSAA offence"
                      >
                        Adj D
                      </th>
                    </>
                  )}
                  {SHOW_EFFICIENCY && (
                    <>
                      <th className="th hidden !text-right md:table-cell">
                        O-Eff
                      </th>
                      <th className="th hidden !text-right md:table-cell">
                        D-Eff
                      </th>
                    </>
                  )}
                  <th className="th hidden !text-right xl:table-cell">PF/G</th>
                  <th className="th hidden !text-right xl:table-cell">PA/G</th>
                  <th className="th !px-2 !text-right sm:w-32 sm:!pr-4">
                    Rating
                  </th>
                </>
              ) : mode === "resume" ? (
                <>
                  <th className="th hidden !text-right md:table-cell">SOS</th>
                  <th
                    className="th hidden !text-right lg:table-cell"
                    title="Wins a top-ten team would be expected to take from this schedule"
                  >
                    Par
                  </th>
                  <th className="th !px-2 !text-right sm:w-32 sm:!pr-4">
                    Résumé
                  </th>
                </>
              ) : (
                <>
                  <th className="th hidden !text-right md:table-cell">Win%</th>
                  <th className="th hidden !text-right md:table-cell">OWP</th>
                  <th className="th hidden !text-right lg:table-cell">OOWP</th>
                  <th className="th !px-2 !text-right sm:!pr-4">RPI</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 && (
              <GroupRow
                colSpan={
                  mode === "index"
                    ? 7 + (hasSplit ? 2 : 0) + (SHOW_EFFICIENCY ? 2 : 0)
                    : mode === "resume"
                      ? 6
                      : 7
                }
                label={
                  scoped ? `Top ${HIGHLIGHT_IN_CLASS}` : `Top ${HIGHLIGHT_OVERALL}`
                }
              />
            )}
            {rows.map((r) => {
              const shown = scoped ? r.class_rank : r.rank;
              const top = shown <= cutoff;
              const ir = mode === "index" ? (r as RatingRow) : null;
              const sr = mode === "resume" ? (r as RatingRow) : null;
              const rr = mode === "rpi" ? (r as RpiRow) : null;
              const games = r.wins + r.losses > 0;
              // Efficiency needs opponents who have played somebody else.
              const eff = r.wins + r.losses >= MIN_GAMES_FOR_EFFICIENCY;
              // The adjusted split is prior-dominated until a few games in.
              const split = r.wins + r.losses >= MIN_GAMES_FOR_SPLIT;

              return (
                <tr
                  key={r.slug}
                  onClick={() => setOpenSlug(r.slug)}
                  className="row-hover cursor-pointer border-b last:border-0"
                  style={{
                    borderColor: "rgb(var(--border) / 0.7)",
                    // The top of the board reads as one block rather than a
                    // few decorated rows.
                    background: top
                      ? "linear-gradient(90deg, rgb(var(--brand) / 0.05), transparent 55%)"
                      : undefined,
                  }}
                >
                  <td
                    className={`td !px-2 !text-center sm:!px-3 stripe-${r.classification}`}
                  >
                    <span
                      className="text-[14px] font-extrabold tnum"
                      style={{
                        color: top
                          ? "rgb(var(--brand))"
                          : "rgb(var(--text-faint))",
                      }}
                    >
                      {shown}
                    </span>
                  </td>

                  <td className="td !whitespace-normal !px-2 sm:!px-3">
                    <span className="block text-[15px] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[16.5px]">
                      {r.name}
                    </span>
                    <span
                      className="mt-[3px] flex items-center gap-1.5 text-[11px]"
                      style={{ color: "rgb(var(--text-faint))" }}
                    >
                      <span className={`cls-text cls-${r.classification}`}>
                        {r.classification}
                      </span>
                      <span>· Region {r.region}</span>
                      {/* Record rides along here once its own column is gone. */}
                      <span className="tnum sm:hidden">
                        · {record(r.wins, r.losses)}
                      </span>
                    </span>
                  </td>

                  <td
                    className="td hidden !text-center text-[13px] font-semibold tnum sm:table-cell"
                    style={{ color: "rgb(var(--text-muted))" }}
                  >
                    {record(r.wins, r.losses)}
                  </td>

                  {ir ? (
                    <>
                      <Cell
                        className="hidden md:table-cell"
                        value={games ? fmt(ir.sos, 1) : "—"}
                        rank={games ? ranks.sos.get(r.slug) : undefined}
                      />
                      {SHOW_EFFICIENCY && (
                        <>
                          <Cell
                            className="hidden md:table-cell"
                            value={eff ? fmtSigned(ir.o_eff) : "—"}
                            rank={eff ? ranks.oEff.get(r.slug) : undefined}
                            tone={eff ? ir.o_eff : undefined}
                          />
                          <Cell
                            className="hidden md:table-cell"
                            value={eff ? fmtSigned(ir.d_eff) : "—"}
                            rank={eff ? ranks.dEff.get(r.slug) : undefined}
                            tone={eff ? ir.d_eff : undefined}
                          />
                        </>
                      )}
                      {hasSplit && (
                        <>
                          <Cell
                            className="hidden md:table-cell"
                            value={split ? fmt(ir.adj_o ?? 0, 1) : "—"}
                            rank={split ? ranks.adjO.get(r.slug) : undefined}
                          />
                          <Cell
                            className="hidden md:table-cell"
                            value={split ? fmt(ir.adj_d ?? 0, 1) : "—"}
                            rank={split ? ranks.adjD.get(r.slug) : undefined}
                          />
                        </>
                      )}
                      <Cell
                        className="hidden xl:table-cell"
                        value={games ? fmt(ir.ppg, 1) : "—"}
                        rank={games ? ranks.ppg.get(r.slug) : undefined}
                      />
                      <Cell
                        className="hidden xl:table-cell"
                        value={games ? fmt(ir.papg, 1) : "—"}
                        rank={games ? ranks.papg.get(r.slug) : undefined}
                      />
                      <td className="td !px-2 !text-right sm:!pr-4">
                        <span
                          className="block text-[19px] font-extrabold leading-none tracking-[-0.03em] tnum"
                          style={{ color: "rgb(var(--rating))" }}
                        >
                          {fmt(ir.rating, 1)}
                        </span>
                        <span className="meter">
                          <span style={{ width: `${scale(ir.rating) * 100}%` }} />
                        </span>
                      </td>
                    </>
                  ) : sr ? (
                    <>
                      <Cell
                        className="hidden md:table-cell"
                        value={fmt(sr.sos, 1)}
                        rank={ranks.sos.get(r.slug)}
                      />
                      <Cell
                        className="hidden lg:table-cell"
                        value={fmt(sr.wins - (sr.sor ?? 0), 2)}
                      />
                      <td className="td !px-2 !text-right sm:!pr-4">
                        <span
                          className="text-[19px] font-extrabold tracking-[-0.03em] tnum"
                          style={{
                            color:
                              (sr.sor ?? 0) >= 0
                                ? "rgb(var(--good))"
                                : "rgb(var(--bad))",
                          }}
                        >
                          {fmtSigned(sr.sor ?? 0, 2)}
                        </span>
                      </td>
                    </>
                  ) : rr ? (
                    <>
                      <Cell
                        className="hidden md:table-cell"
                        value={games ? fmtPct(rr.win_pct) : "—"}
                      />
                      <Cell
                        className="hidden md:table-cell"
                        value={games ? fmtPct(rr.opp_win_pct) : "—"}
                      />
                      <Cell
                        className="hidden lg:table-cell"
                        value={games ? fmtPct(rr.opp_opp_win_pct) : "—"}
                      />
                      <td className="td !px-2 !text-right sm:!pr-4">
                        <span
                          className="text-[19px] font-extrabold tracking-[-0.03em] tnum"
                          style={{ color: "rgb(var(--rating))" }}
                        >
                          {rr.rpi.toFixed(4)}
                        </span>
                      </td>
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

      {!hasResults && mode === "index" && (
        <p
          className="mt-3 text-[12px]"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          Preseason — no games played yet. Schedule-based figures fill in once
          results are entered.
        </p>
      )}

      <TeamPanel
        payload={payload}
        slug={openSlug}
        onClose={() => setOpenSlug(null)}
        columnRanks={ranks}
      />
    </>
  );
}

/**
 * Header for the highlighted block at the top of the board.
 *
 * There is deliberately no matching marker where the block ends — the tint
 * simply stopping is enough, and a second divider was just noise.
 */
function GroupRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="group-row border-b"
        style={{ borderColor: "rgb(var(--border))" }}
      >
        {label}
      </td>
    </tr>
  );
}

/** Numeric cell carrying its rank across the field, as on the 2025 site. */
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
      <span className="text-[13px] font-semibold tnum" style={{ color }}>
        {value}
      </span>
      {rank !== undefined && (
        <span
          className="ml-1 text-[10px] tnum"
          style={{ color: "rgb(var(--brand) / 0.75)" }}
        >
          #{rank}
        </span>
      )}
    </td>
  );
}

function Pill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button onClick={onClick} className={`pill ${active ? "pill-active" : ""}`}>
      {label}
    </button>
  );
}
