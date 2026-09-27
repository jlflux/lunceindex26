"use client";

import Link from "next/link";
import ForfeitMark from "./ForfeitMark";
import StatPill from "./StatPill";
import { useMemo, useState } from "react";
import Icon from "./Icon";
import { fmt, ordinal, record } from "@/lib/format";
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
function RegionPill({ r }: { r: Record2 | undefined }) {
  const w = r?.wins ?? 0;
  const l = r?.losses ?? 0;
  const t = r?.ties ?? 0;
  const played = w + l + t;
  // Half credit for a level game, and counted in the denominator. Alabama
  // decides football in overtime so this only matters if one is entered by
  // mistake — but a tie hidden from the record makes the percentage lie.
  const pct = played ? (w + t / 2) / played : 0.5;
  const text = t ? `${w}-${l}-${t}` : `${w}-${l}`;
  return (
    <StatPill
      className="!text-[12px]"
      empty={played === 0}
      hot={pct >= 0.5}
      strength={Math.abs(pct - 0.5) * 2}
      title={played ? `${text} in region play` : "No region games played yet"}
    >
      {text}
    </StatPill>
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
                const qualifiers = qualifiersFor(c, list.length);
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
                        const place = list.indexOf(t);
                        // The rule only goes under the last qualifier, and
                        // only when the team below it is on screen to be
                        // separated from.
                        const after = list.filter(matches);
                        const next = after[after.indexOf(t) + 1];
                        const cut =
                          place + 1 === qualifiers &&
                          next !== undefined &&
                          list.indexOf(next) >= qualifiers;
                        return (
                          <li
                            key={t.slug}
                            style={{
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
                                {place + 1}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold">
                                  {t.name}
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
                              <RegionPill r={reg.get(t.name)} />
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
