"use client";

import { Fragment, useMemo, useState } from "react";
import Icon from "./Icon";
import TeamPanel from "./TeamPanel";
import { fmt, fmtPct, fmtSigned, record } from "@/lib/format";
import {
  CLS_FILTER_ORDER,
  type Classification,
  type RatingRow,
  type RatingsPayload,
  type RpiRow,
} from "@/lib/types";

type Mode = "index" | "rpi";

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
  [...rows]
    .sort((a, b) => (higherIsBetter ? get(b) - get(a) : get(a) - get(b)))
    .forEach((r, i) => m.set(r.slug, i + 1));
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

  const source = mode === "index" ? ratings : rpi;
  const hasResults = ratings.some((r) => r.wins + r.losses > 0);

  const ranks = useMemo(
    () => ({
      sos: columnRank(ratings, (r) => r.sos),
      oEff: columnRank(ratings, (r) => r.o_eff),
      dEff: columnRank(ratings, (r) => r.d_eff),
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

  // Where the highlighted block ends, so a divider can be dropped in. Only
  // meaningful when the board is in rank order and actually reaches the cutoff.
  const breakAt = useMemo(() => {
    const i = rows.findIndex((r) => (scoped ? r.class_rank : r.rank) > cutoff);
    return i > 0 ? i : -1;
  }, [rows, scoped, cutoff]);

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
        <table className="w-full min-w-[880px]">
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
              <th className="th !text-center">Record</th>
              {mode === "index" ? (
                <>
                  <th className="th !text-right">SOS</th>
                  <th className="th !text-right">O-Eff</th>
                  <th className="th !text-right">D-Eff</th>
                  <th className="th hidden !text-right xl:table-cell">PF/G</th>
                  <th className="th hidden !text-right xl:table-cell">PA/G</th>
                  <th className="th w-32 !pr-4 !text-right">Index Rating</th>
                </>
              ) : (
                <>
                  <th className="th !text-right">Win%</th>
                  <th className="th !text-right">OWP</th>
                  <th className="th hidden !text-right lg:table-cell">OOWP</th>
                  <th className="th !pr-4 !text-right">RPI</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 && (
              <GroupRow
                colSpan={mode === "index" ? 9 : 7}
                label={
                  scoped ? `Top ${HIGHLIGHT_IN_CLASS}` : `Top ${HIGHLIGHT_OVERALL}`
                }
              />
            )}
            {rows.map((r, i) => {
              const shown = scoped ? r.class_rank : r.rank;
              const top = shown <= cutoff;
              const ir = mode === "index" ? (r as RatingRow) : null;
              const rr = mode === "rpi" ? (r as RpiRow) : null;
              const games = r.wins + r.losses > 0;

              return (
                <Fragment key={r.slug}>
                  {i === breakAt && (
                    <GroupRow
                      rest
                      colSpan={mode === "index" ? 9 : 7}
                      label={`The rest of the field`}
                    />
                  )}
                <tr
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
                  <td className={`td !text-center stripe-${r.classification}`}>
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

                  <td className="td">
                    <span className="block text-[16.5px] font-bold leading-[1.15] tracking-[-0.02em]">
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
                    </span>
                  </td>

                  <td
                    className="td !text-center text-[13px] font-semibold tnum"
                    style={{ color: "rgb(var(--text-muted))" }}
                  >
                    {record(r.wins, r.losses)}
                  </td>

                  {ir ? (
                    <>
                      <Cell
                        value={games ? fmt(ir.sos, 1) : "—"}
                        rank={games ? ranks.sos.get(r.slug) : undefined}
                      />
                      <Cell
                        value={games ? fmtSigned(ir.o_eff) : "—"}
                        rank={games ? ranks.oEff.get(r.slug) : undefined}
                        tone={games ? ir.o_eff : undefined}
                      />
                      <Cell
                        value={games ? fmtSigned(ir.d_eff) : "—"}
                        rank={games ? ranks.dEff.get(r.slug) : undefined}
                        tone={games ? ir.d_eff : undefined}
                      />
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
                      <td className="td !pr-4 !text-right">
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
                  ) : rr ? (
                    <>
                      <Cell value={games ? fmtPct(rr.win_pct) : "—"} />
                      <Cell value={games ? fmtPct(rr.opp_win_pct) : "—"} />
                      <Cell
                        className="hidden lg:table-cell"
                        value={games ? fmtPct(rr.opp_opp_win_pct) : "—"}
                      />
                      <td className="td !pr-4 !text-right">
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
                </Fragment>
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

/** Divider inside the board, marking where the highlighted block ends. */
function GroupRow({
  label,
  colSpan,
  rest = false,
}: {
  label: string;
  colSpan: number;
  rest?: boolean;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={`group-row ${rest ? "group-rest" : ""} border-b`}
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
