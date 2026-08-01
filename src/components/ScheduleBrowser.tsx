"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "./Icon";
import { weekLabel } from "@/lib/format";
import {
  CLS_FILTER_ORDER,
  type Classification,
  type Game,
} from "@/lib/types";

export interface ScheduleGame
  extends Pick<
    Game,
    "t1" | "t2" | "s1" | "s2" | "week" | "type" | "round" | "date"
  > {
  t1Slug: string | null;
  t2Slug: string | null;
  t1Class: Classification | null;
  t2Class: Classification | null;
  t1Rank: number | null;
  t2Rank: number | null;
}

/** Position in the display order: 6A first, down to 1A, then AA, then A. */
function classOrder(c: Classification | null): number {
  if (!c) return CLS_FILTER_ORDER.length; // out-of-state sorts last
  const i = CLS_FILTER_ORDER.indexOf(c);
  return i < 0 ? CLS_FILTER_ORDER.length : i;
}

export default function ScheduleBrowser({ games }: { games: ScheduleGame[] }) {
  const [cls, setCls] = useState<Classification | "all">("all");
  const [week, setWeek] = useState<string>("all");
  const [query, setQuery] = useState("");

  const weeks = useMemo(() => {
    const keys = new Map<string, ScheduleGame>();
    for (const g of games) {
      const k = g.type === "playoff" ? `p:${g.round ?? "r0"}` : `r:${g.week}`;
      if (!keys.has(k)) keys.set(k, g);
    }
    return [...keys.entries()].sort((a, b) => {
      const rank = (k: string) =>
        k.startsWith("p:") ? 100 + Number(k.slice(3) || 0) : Number(k.slice(2));
      return rank(a[0]) - rank(b[0]);
    });
  }, [games]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = games.filter((g) => {
      if (week !== "all") {
        const k = g.type === "playoff" ? `p:${g.round ?? "r0"}` : `r:${g.week}`;
        if (k !== week) return false;
      }
      // Either side matching keeps a team's away games in its own filter.
      if (cls !== "all" && g.t1Class !== cls && g.t2Class !== cls) return false;
      if (q && !`${g.t1} ${g.t2}`.toLowerCase().includes(q)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      const ca = classOrder(a.t1Class);
      const cb = classOrder(b.t1Class);
      if (ca !== cb) return ca - cb;
      // Within a classification, the better home team first.
      const ra = a.t1Rank ?? Number.MAX_SAFE_INTEGER;
      const rb = b.t1Rank ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.t1.localeCompare(b.t1);
    });
  }, [games, cls, week, query]);

  const withResults = shown.filter((g) => g.s1 !== null && g.s2 !== null).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div
        className="flex flex-col gap-3 rounded-xl border px-3 py-3 lg:flex-row lg:items-center"
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
            className="input !pl-9"
            placeholder="Search teams…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search games"
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
              onClick={() => setCls("all")}
              label="All"
            />
            {CLS_FILTER_ORDER.map((c) => (
              <Pill
                key={c}
                active={cls === c}
                onClick={() => setCls(c)}
                label={c}
              />
            ))}
          </div>
        </div>

        <span
          className="shrink-0 text-[12px] tnum"
          style={{ color: "rgb(var(--text-muted))" }}
        >
          {shown.length} games · {withResults} final
        </span>
      </div>

      {/* Week filter, secondary to classification */}
      <div className="table-scroll scroll-thin">
        <div className="flex items-center gap-1.5">
          <span
            className="mr-1 shrink-0 text-[10.5px] font-bold uppercase tracking-wider"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            Week
          </span>
          <Pill
            active={week === "all"}
            onClick={() => setWeek("all")}
            label="All"
          />
          {weeks.map(([k, sample]) => (
            <Pill
              key={k}
              active={week === k}
              onClick={() => setWeek(k)}
              label={weekLabel(sample).replace("Week ", "Wk ")}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        {shown.map((g, i) => (
          <GameCard key={i} g={g} />
        ))}
      </div>

      {!shown.length && (
        <div
          className="rounded-xl border px-4 py-14 text-center text-sm"
          style={{
            borderColor: "rgb(var(--border))",
            color: "rgb(var(--text-faint))",
          }}
        >
          No games match those filters.
        </div>
      )}
    </div>
  );
}

function GameCard({ g }: { g: ScheduleGame }) {
  const played = g.s1 !== null && g.s2 !== null;
  const homeWon = played && Number(g.s1) > Number(g.s2);
  const awayWon = played && Number(g.s2) > Number(g.s1);

  return (
    <div
      className="rounded-xl border px-3.5 py-3"
      style={{
        background: "rgb(var(--surface))",
        borderColor: "rgb(var(--border))",
      }}
    >
      <div
        className="mb-2 flex items-center justify-between text-[11px]"
        style={{ color: "rgb(var(--text-faint))" }}
      >
        <span>
          {weekLabel(g)}
          {g.date ? ` · ${g.date}` : ""}
        </span>
        <span
          className="chip !px-1.5"
          style={{
            background: played
              ? "rgb(var(--surface-3))"
              : "rgb(var(--brand) / 0.09)",
            color: played ? "rgb(var(--text-muted))" : "rgb(var(--brand))",
          }}
        >
          {played ? "Final" : "Upcoming"}
        </span>
      </div>

      <Side
        name={g.t2}
        slug={g.t2Slug}
        cls={g.t2Class}
        rank={g.t2Rank}
        score={g.s2}
        won={awayWon}
        played={played}
      />
      <Side
        name={g.t1}
        slug={g.t1Slug}
        cls={g.t1Class}
        rank={g.t1Rank}
        score={g.s1}
        won={homeWon}
        played={played}
        home
      />
    </div>
  );
}

function Side({
  name,
  slug,
  cls,
  rank,
  score,
  won,
  played,
  home,
}: {
  name: string;
  slug: string | null;
  cls: Classification | null;
  rank: number | null;
  score: number | null;
  won: boolean;
  played: boolean;
  home?: boolean;
}) {
  const dim = played && !won;
  return (
    <div className="flex items-center gap-2 py-[3px]">
      {cls ? (
        <span className={`chip cls-${cls} !min-w-[30px] !px-1`}>{cls}</span>
      ) : (
        <span
          className="chip !min-w-[30px] !px-1"
          style={{
            background: "rgb(var(--surface-3))",
            color: "rgb(var(--text-faint))",
          }}
        >
          OOS
        </span>
      )}

      {slug ? (
        <Link
          href={`/team/${slug}`}
          className="min-w-0 flex-1 truncate text-[13.5px] font-semibold hover:underline"
          style={{ opacity: dim ? 0.55 : 1 }}
        >
          {name}
        </Link>
      ) : (
        <span
          className="min-w-0 flex-1 truncate text-[13.5px] font-semibold"
          style={{ opacity: dim ? 0.55 : 1 }}
        >
          {name}
        </span>
      )}

      {rank && (
        <span
          className="shrink-0 text-[10.5px] tnum"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          #{rank}
        </span>
      )}

      {home && (
        <span
          className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wide"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          home
        </span>
      )}

      {played && (
        <span
          className="w-8 shrink-0 text-right text-[14px] font-bold tnum"
          style={{ opacity: won ? 1 : 0.6 }}
        >
          {score}
        </span>
      )}
    </div>
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
