"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "./Icon";
import { fmt, ordinal, record } from "@/lib/format";
import { regionRecords, standingsCompare } from "@/lib/season";
import {
  CLS_FILTER_ORDER,
  type Classification,
  type Game,
  type RatingRow,
} from "@/lib/types";

/** Region record, or a dash when region play has not started. */
function regionLabel(r: { wins: number; losses: number } | undefined): string {
  if (!r || r.wins + r.losses === 0) return "0-0";
  return `${r.wins}-${r.losses}`;
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

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (cls !== "all" && r.classification !== cls) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });

    // Classification → region → teams, each ordered by rating.
    const byClass = new Map<Classification, Map<number, RatingRow[]>>();
    for (const r of filtered) {
      const regions = byClass.get(r.classification) ?? new Map();
      const list = regions.get(r.region) ?? [];
      list.push(r);
      regions.set(r.region, list);
      byClass.set(r.classification, regions);
    }
    return byClass;
  }, [rows, query, cls]);

  const total = [...grouped.values()].reduce(
    (n, regions) =>
      n + [...regions.values()].reduce((m, list) => m + list.length, 0),
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
        team{total === 1 ? "" : "s"}
      </p>

      {CLS_FILTER_ORDER.filter((c) => grouped.has(c)).map((c) => {
        const regions = grouped.get(c)!;
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
                {[...regions.values()].reduce((n, l) => n + l.length, 0)} teams
              </span>
            </h2>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[...regions.keys()]
                .sort((a, b) => a - b)
                .map((regionNo) => (
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
                    <ul className="divide-y" style={{ borderColor: "rgb(var(--border))" }}>
                      {[...regions.get(regionNo)!]
                        .sort((a, b) => standingsCompare(a, b, reg))
                        .map((t) => (
                          <li key={t.slug}>
                            <Link
                              href={`/team/${t.slug}`}
                              className="row-hover flex items-center justify-between gap-2 px-3 py-2 transition-colors"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-[13px] font-semibold">
                                  {t.name}
                                </span>
                                <span
                                  className="text-[11px]"
                                  style={{ color: "rgb(var(--text-faint))" }}
                                >
                                  {ordinal(t.rank)} ·{" "}
                                  {record(t.wins, t.losses)}{" "}
                                  <span style={{ color: "rgb(var(--text-muted))" }}>
                                    ({regionLabel(reg.get(t.name))})
                                  </span>
                                </span>
                              </span>
                              <span className="shrink-0 text-[13px] font-bold tnum">
                                {fmt(t.rating, 1)}
                              </span>
                            </Link>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
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
