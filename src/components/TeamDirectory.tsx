"use client";

import Link from "next/link";
import ForfeitMark from "./ForfeitMark";
import StatPill from "./StatPill";
import { useMemo, useState } from "react";
import Icon from "./Icon";
import { fmt, ordinal, record } from "@/lib/format";
import { recordShade } from "@/lib/shade";
import { qualifiersFor } from "@/lib/playoffs";
import {
  orderRegionStandings,
  regionRecords,
  tieDataFor,
  type Record2,
} from "@/lib/season";
import {
  CLS_FILTER_ORDER,
  type Classification,
  type Game,
  type RatingRow,
} from "@/lib/types";

/**
 * A region record as a shaded pill.
 *
 * Scaled against .500 rather than against the best record on the page. A
 * winning record means the same thing in every region in the state, so an
 * absolute scale is the honest one here — unlike the odds board, where each
 * column has to be read against its own range. 0-0 is drawn flat: a team that
 * has not started region play has not lost anything.
 */
/**
 * A region record, shaded either side of .500.
 *
 * This one stays two-sided while most of the odds board is not, and the reason
 * is the same rule read the other way: a record has a genuine midpoint. A
 * losing record really is the wrong side of something, and .500 means the same
 * thing in every region in the state — so red here marks a team in trouble
 * rather than merely a small number. See `src/lib/shade.ts`.
 */
function RegionPill({
  r,
  barred,
}: {
  r: Record2 | undefined;
  barred?: boolean;
}) {
  const w = r?.wins ?? 0;
  const l = r?.losses ?? 0;
  const t = r?.ties ?? 0;
  const { hot, strength, played } = recordShade(w, l, t);
  const text = t ? `${w}-${l}-${t}` : `${w}-${l}`;

  // A barred team is 0-0 because its region games counted for nobody, not
  // because it has not started. Printing "0-0" against the neutral shade
  // would read as a team yet to play, so it says nothing at all instead.
  if (barred) {
    return (
      <StatPill
        className="!text-[12px]"
        empty
        hot={false}
        strength={0}
        title="No region record — this team is barred from the postseason, so its region games count for neither side"
      >
        &mdash;
      </StatPill>
    );
  }

  return (
    <StatPill
      className="!text-[12px]"
      empty={played === 0}
      hot={hot}
      strength={strength}
      title={played ? `${text} in region play` : "No region games played yet"}
    >
      {text}
    </StatPill>
  );
}

/** The marker beside a team barred from championship play. */
function BarredMark({ note }: { note?: string | null }) {
  return (
    <span
      className="ml-1.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase align-middle"
      style={{
        background: "rgb(var(--warn-soft))",
        color: "rgb(var(--warn))",
      }}
      title={
        note
          ? `Barred from the postseason — ${note}`
          : "Barred from the postseason"
      }
    >
      barred
    </span>
  );
}

export default function TeamDirectory({
  rows,
  games = [],
}: {
  rows: RatingRow[];
  games?: Game[];
}) {
  const [query, setQuery] = useState("");
  const [cls, setCls] = useState<Classification | "all">("all");

  // Region record is what qualifies a team for the playoffs, so it leads the
  // ordering inside each region box — ahead of the rating, which has no
  // bearing on qualification at all.
  const reg = useMemo(() => regionRecords(rows, games), [rows, games]);
  // Everything the AHSAA tiebreakers reach for, gathered once.
  const tie = useMemo(() => tieDataFor(rows, games), [rows, games]);

  // Grouped and ordered from the whole class, then narrowed for display. A
  // team's place in its region and the playoff line under the qualifiers have
  // to keep meaning what they say while a search is running — filtering first
  // would renumber the region and move the line to wherever the matches fell.
  const grouped = useMemo(() => {
    const byClass = new Map<Classification, Map<number, RatingRow[]>>();
    for (const r of rows) {
      if (cls !== "all" && r.classification !== cls) continue;
      const regions = byClass.get(r.classification) ?? new Map();
      const list = regions.get(r.region) ?? [];
      list.push(r);
      regions.set(r.region, list);
      byClass.set(r.classification, regions);
    }
    for (const regions of byClass.values()) {
      for (const [n, list] of regions) {
        regions.set(n, orderRegionStandings(list, reg, tie));
      }
    }
    return byClass;
  }, [rows, cls, reg, tie]);

  const q = query.trim().toLowerCase();
  const matches = (t: RatingRow) => !q || t.name.toLowerCase().includes(q);

  const total = [...grouped.values()].reduce(
    (n, regions) =>
      n +
      [...regions.values()].reduce(
        (m, list) => m + list.filter(matches).length,
        0,
      ),
    0,
  );

  return (
    <div className="space-y-5">
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
            className="input !pl-9"
            placeholder="Search teams…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search teams"
          />
        </div>

        <div className="table-scroll scroll-thin -mx-4 px-4 lg:mx-0 lg:flex-1 lg:px-0">
          <div className="flex gap-1.5 pb-0.5">
            {(["all", ...CLS_FILTER_ORDER] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCls(c as Classification | "all")}
                className={`pill ${cls === c ? "pill-active" : ""}`}
              >
                {c === "all" ? "All" : c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
        <span className="font-semibold" style={{ color: "rgb(var(--text))" }}>
          {total}
        </span>{" "}
        team{total === 1 ? "" : "s"} · the rule in each box is the playoff line,
        and the shaded record is the one that decides it
      </p>

      {CLS_FILTER_ORDER.filter((c) => grouped.has(c)).map((c) => {
        const regions = grouped.get(c)!;
        const shown = [...regions.keys()]
          .sort((a, b) => a - b)
          .filter((n) => regions.get(n)!.some(matches));
        if (!shown.length) return null;
        return (
          <section key={c}>
            <h2 className="mb-2.5 flex items-center gap-2">
              <span className={`chip cls-${c} !px-2 !py-1 !text-xs`}>
                Class {c}
              </span>
              <span
                className="text-xs"
                style={{ color: "rgb(var(--text-faint))" }}
              >
                {[...regions.values()].reduce(
                  (n, l) => n + l.filter(matches).length,
                  0,
                )}{" "}
                teams · top {qualifiersFor(c)} of each region qualify
              </span>
            </h2>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {shown.map((regionNo) => {
                const list = regions.get(regionNo)!;
                // A team barred from the postseason is sorted to the end by
                // orderRegionStandings and cannot take a place, so it counts
                // toward neither the region's size nor the place numbers.
                const eligible = list.filter((t) => !t.postseason_ineligible);
                const qualifiers = qualifiersFor(c, eligible.length);
                return (
                  <div key={regionNo} className="card overflow-hidden">
                    <div
                      className="border-b px-3 py-2 text-[11px] font-bold uppercase tracking-wider"
                      style={{
                        borderColor: "rgb(var(--border))",
                        background: "rgb(var(--surface-2))",
                        color: "rgb(var(--text-faint))",
                      }}
                    >
                      Region {regionNo}
                    </div>
                    <ul>
                      {list.filter(matches).map((t) => {
                        const barred = t.postseason_ineligible === true;
                        const place = eligible.indexOf(t);
                        // The rule only goes under the last qualifier, and
                        // only when the team below it is on screen to be
                        // separated from.
                        const after = list.filter(matches);
                        const next = after[after.indexOf(t) + 1];
                        const cut =
                          !barred &&
                          place + 1 === qualifiers &&
                          next !== undefined &&
                          (next.postseason_ineligible === true ||
                            eligible.indexOf(next) >= qualifiers);
                        return (
                          <li
                            key={t.slug}
                            style={{
                              opacity: barred ? 0.55 : 1,
                              borderBottom: cut
                                ? "2px solid rgb(var(--brand) / 0.55)"
                                : "1px solid rgb(var(--border))",
                            }}
                          >
                            <Link
                              href={`/team/${t.slug}`}
                              className="row-hover flex items-center gap-2 px-3 py-2 transition-colors"
                            >
                              <span
                                className="w-3.5 shrink-0 text-[11px] tnum"
                                style={{ color: "rgb(var(--text-faint))" }}
                              >
                                {barred ? "\u2014" : place + 1}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold">
                                  {t.name}
                                  {barred && <BarredMark note={t.postseason_note} />}
                                </span>
                                <span
                                  className="text-[11px]"
                                  style={{ color: "rgb(var(--text-faint))" }}
                                >
                                  {ordinal(t.rank)} · {record(t.wins, t.losses)}
                                  <ForfeitMark n={t.forfeits} /> ·{" "}
                                  <span
                                    style={{ color: "rgb(var(--text-muted))" }}
                                  >
                                    {fmt(t.rating, 1)}
                                  </span>
                                </span>
                              </span>
                              <RegionPill r={reg.get(t.name)} barred={barred} />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {total === 0 && (
        <div
          className="card px-4 py-14 text-center text-sm"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          No teams match those filters.
        </div>
      )}
    </div>
  );
}
