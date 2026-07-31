"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ClassBadge from "./ClassBadge";
import { fmt, fmtPct, fmtSigned, record } from "@/lib/format";
import {
  CLS_FILTER_ORDER,
  type Classification,
  type RatingRow,
  type RpiRow,
} from "@/lib/types";

type Tab = "index" | "rpi";

export default function RatingsExplorer({
  ratings,
  rpi,
}: {
  ratings: RatingRow[];
  rpi: RpiRow[];
}) {
  const [tab, setTab] = useState<Tab>("index");
  const [cls, setCls] = useState<Classification | "all">("all");
  const [region, setRegion] = useState<number | "all">("all");
  const [query, setQuery] = useState("");

  // Regions only make sense once a classification is chosen.
  const regions = useMemo(() => {
    if (cls === "all") return [];
    const set = new Set(
      ratings.filter((r) => r.classification === cls).map((r) => r.region),
    );
    return [...set].sort((a, b) => a - b);
  }, [ratings, cls]);

  const rows = useMemo(() => {
    const source: (RatingRow | RpiRow)[] = tab === "index" ? ratings : rpi;
    const q = query.trim().toLowerCase();
    return source.filter((r) => {
      if (cls !== "all" && r.classification !== cls) return false;
      if (region !== "all" && r.region !== region) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tab, ratings, rpi, cls, region, query]);

  function pickClass(next: Classification | "all") {
    setCls(next);
    setRegion("all");
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div
        className="flex w-full gap-1 rounded-xl p-1"
        style={{ background: "rgb(var(--surface-2))" }}
        role="tablist"
      >
        {(
          [
            ["index", "Power Index"],
            ["rpi", "RPI"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
            style={
              tab === id
                ? {
                    background: "rgb(var(--surface))",
                    color: "rgb(var(--text))",
                    boxShadow: "var(--shadow)",
                  }
                : { color: "rgb(var(--text-muted))" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="table-scroll -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1.5 pb-1">
            <FilterChip
              active={cls === "all"}
              onClick={() => pickClass("all")}
              label="All"
            />
            {CLS_FILTER_ORDER.map((c) => (
              <FilterChip
                key={c}
                active={cls === c}
                onClick={() => pickClass(c)}
                label={c}
              />
            ))}
          </div>
        </div>

        {regions.length > 0 && (
          <div className="table-scroll -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-1.5 pb-1">
              <FilterChip
                active={region === "all"}
                onClick={() => setRegion("all")}
                label="All regions"
              />
              {regions.map((r) => (
                <FilterChip
                  key={r}
                  active={region === r}
                  onClick={() => setRegion(r)}
                  label={`Region ${r}`}
                />
              ))}
            </div>
          </div>
        )}

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search teams…"
          className="input"
          aria-label="Search teams"
        />
      </div>

      <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
        {rows.length} team{rows.length === 1 ? "" : "s"}
        {cls !== "all" && ` · showing ${cls} rank within class`}
      </p>

      <div className="card table-scroll">
        {tab === "index" ? (
          <IndexTable rows={rows as RatingRow[]} scoped={cls !== "all"} />
        ) : (
          <RpiTable rows={rows as RpiRow[]} scoped={cls !== "all"} />
        )}
      </div>
    </div>
  );
}

function FilterChip({
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
      className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
      style={
        active
          ? { background: "rgb(var(--accent))", color: "#fff" }
          : {
              background: "rgb(var(--surface-2))",
              color: "rgb(var(--text-muted))",
            }
      }
    >
      {label}
    </button>
  );
}

const th =
  "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap";
const td = "px-3 py-2.5 text-sm whitespace-nowrap";

function TeamCell({
  row,
}: {
  row: { name: string; slug: string; classification: Classification; region: number };
}) {
  return (
    <td className={`${td} min-w-[190px]`}>
      <Link
        href={`/team/${row.slug}`}
        className="flex items-center gap-2 font-semibold hover:underline"
      >
        <span className="truncate">{row.name}</span>
      </Link>
      <div className="mt-1">
        <ClassBadge classification={row.classification} region={row.region} />
      </div>
    </td>
  );
}

function IndexTable({ rows, scoped }: { rows: RatingRow[]; scoped: boolean }) {
  if (!rows.length) return <Empty />;
  return (
    <table className="w-full">
      <thead>
        <tr
          className="border-b"
          style={{
            borderColor: "rgb(var(--border))",
            color: "rgb(var(--text-faint))",
          }}
        >
          <th className={`${th} w-12`}>#</th>
          <th className={th}>Team</th>
          <th className={`${th} text-right`}>Rating</th>
          <th className={`${th} text-right`}>Rec</th>
          <th className={`${th} hidden text-right sm:table-cell`}>SOS</th>
          <th className={`${th} hidden text-right md:table-cell`}>Massey</th>
          <th className={`${th} hidden text-right lg:table-cell`}>Off</th>
          <th className={`${th} hidden text-right lg:table-cell`}>Def</th>
          <th className={`${th} hidden text-right lg:table-cell`}>PPG</th>
          <th className={`${th} hidden text-right lg:table-cell`}>PAPG</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.slug}
            className="border-b last:border-0 transition-colors hover:bg-[rgb(var(--surface-2))]"
            style={{ borderColor: "rgb(var(--border))" }}
          >
            <td
              className={`${td} font-bold`}
              style={{ color: "rgb(var(--text-faint))" }}
            >
              {scoped ? r.class_rank : r.rank}
            </td>
            <TeamCell row={r} />
            <td className={`${td} text-right font-bold`}>{fmt(r.rating)}</td>
            <td
              className={`${td} text-right`}
              style={{ color: "rgb(var(--text-muted))" }}
            >
              {record(r.wins, r.losses)}
            </td>
            <td
              className={`${td} hidden text-right sm:table-cell`}
              style={{ color: "rgb(var(--text-muted))" }}
            >
              {r.sos > 0 ? fmt(r.sos) : "—"}
            </td>
            <td
              className={`${td} hidden text-right md:table-cell`}
              style={{ color: "rgb(var(--text-muted))" }}
            >
              {fmt(r.massey)}
            </td>
            <td className={`${td} hidden text-right lg:table-cell`}>
              <Diff v={r.o_eff} played={r.wins + r.losses > 0} />
            </td>
            <td className={`${td} hidden text-right lg:table-cell`}>
              <Diff v={r.d_eff} played={r.wins + r.losses > 0} />
            </td>
            <td
              className={`${td} hidden text-right lg:table-cell`}
              style={{ color: "rgb(var(--text-muted))" }}
            >
              {r.wins + r.losses ? fmt(r.ppg, 1) : "—"}
            </td>
            <td
              className={`${td} hidden text-right lg:table-cell`}
              style={{ color: "rgb(var(--text-muted))" }}
            >
              {r.wins + r.losses ? fmt(r.papg, 1) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RpiTable({ rows, scoped }: { rows: RpiRow[]; scoped: boolean }) {
  if (!rows.length) return <Empty />;
  return (
    <table className="w-full">
      <thead>
        <tr
          className="border-b"
          style={{
            borderColor: "rgb(var(--border))",
            color: "rgb(var(--text-faint))",
          }}
        >
          <th className={`${th} w-12`}>#</th>
          <th className={th}>Team</th>
          <th className={`${th} text-right`}>RPI</th>
          <th className={`${th} text-right`}>Rec</th>
          <th className={`${th} hidden text-right sm:table-cell`}>Win%</th>
          <th className={`${th} hidden text-right md:table-cell`}>OWP</th>
          <th className={`${th} hidden text-right md:table-cell`}>OOWP</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.slug}
            className="border-b last:border-0 transition-colors hover:bg-[rgb(var(--surface-2))]"
            style={{ borderColor: "rgb(var(--border))" }}
          >
            <td
              className={`${td} font-bold`}
              style={{ color: "rgb(var(--text-faint))" }}
            >
              {scoped ? r.class_rank : r.rank}
            </td>
            <TeamCell row={r} />
            <td className={`${td} text-right font-bold`}>{fmt(r.rpi, 4)}</td>
            <td
              className={`${td} text-right`}
              style={{ color: "rgb(var(--text-muted))" }}
            >
              {record(r.wins, r.losses)}
            </td>
            <td
              className={`${td} hidden text-right sm:table-cell`}
              style={{ color: "rgb(var(--text-muted))" }}
            >
              {fmtPct(r.win_pct)}
            </td>
            <td
              className={`${td} hidden text-right md:table-cell`}
              style={{ color: "rgb(var(--text-muted))" }}
            >
              {fmtPct(r.opp_win_pct)}
            </td>
            <td
              className={`${td} hidden text-right md:table-cell`}
              style={{ color: "rgb(var(--text-muted))" }}
            >
              {fmtPct(r.opp_opp_win_pct)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Diff({ v, played }: { v: number; played: boolean }) {
  if (!played) return <span style={{ color: "rgb(var(--text-faint))" }}>—</span>;
  return (
    <span
      style={{
        color:
          v > 0.5
            ? "rgb(var(--good))"
            : v < -0.5
              ? "rgb(var(--bad))"
              : "rgb(var(--text-muted))",
      }}
    >
      {fmtSigned(v)}
    </span>
  );
}

function Empty() {
  return (
    <div
      className="px-4 py-16 text-center text-sm"
      style={{ color: "rgb(var(--text-faint))" }}
    >
      No teams match those filters.
    </div>
  );
}
