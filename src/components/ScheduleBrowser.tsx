"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "./Icon";
import { weekLabel } from "@/lib/format";
import type { Classification, Game } from "@/lib/types";

export interface ScheduleGame
  extends Pick<Game, "t1" | "t2" | "s1" | "s2" | "week" | "type" | "round" | "date"> {
  t1Slug: string | null;
  t2Slug: string | null;
  t1Class: Classification | null;
  t2Class: Classification | null;
}

export default function ScheduleBrowser({ games }: { games: ScheduleGame[] }) {
  const weeks = useMemo(() => {
    const keys = new Map<string, ScheduleGame[]>();
    for (const g of games) {
      const k = g.type === "playoff" ? `p:${g.round ?? "r0"}` : `r:${g.week}`;
      const list = keys.get(k) ?? [];
      list.push(g);
      keys.set(k, list);
    }
    return [...keys.entries()].sort((a, b) => {
      const rank = (k: string) =>
        k.startsWith("p:") ? 100 + Number(k.slice(3) || 0) : Number(k.slice(2));
      return rank(a[0]) - rank(b[0]);
    });
  }, [games]);

  // Default to the most recent week with a result, else the earliest week.
  const defaultKey = useMemo(() => {
    const withResults = weeks.filter(([, list]) =>
      list.some((g) => g.s1 !== null && g.s2 !== null),
    );
    return (withResults.at(-1) ?? weeks[0])?.[0] ?? "";
  }, [weeks]);

  const [key, setKey] = useState(defaultKey);
  const [query, setQuery] = useState("");

  const current = weeks.find(([k]) => k === key)?.[1] ?? [];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return current;
    return current.filter((g) =>
      `${g.t1} ${g.t2}`.toLowerCase().includes(q),
    );
  }, [current, query]);

  return (
    <div className="space-y-4">
      <div className="table-scroll scroll-thin -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1.5 pb-0.5">
          {weeks.map(([k, list]) => {
            const sample = list[0];
            return (
              <button
                key={k}
                onClick={() => setKey(k)}
                className="shrink-0 rounded-[10px] border px-3 py-1.5 text-xs font-semibold transition-colors"
                style={
                  key === k
                    ? {
                        background: "rgb(var(--primary))",
                        borderColor: "rgb(var(--primary))",
                        color: "rgb(var(--primary-fg))",
                      }
                    : {
                        background: "rgb(var(--surface))",
                        borderColor: "rgb(var(--border))",
                        color: "rgb(var(--text-muted))",
                      }
                }
              >
                {weekLabel(sample)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative sm:w-72">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          <Icon name="search" size={15} />
        </span>
        <input
          type="search"
          className="input !pl-9"
          placeholder="Search this week…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search games"
        />
      </div>

      <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
        <span className="font-semibold" style={{ color: "rgb(var(--text))" }}>
          {shown.length}
        </span>{" "}
        game{shown.length === 1 ? "" : "s"}
        {" · "}
        {shown.filter((g) => g.s1 !== null && g.s2 !== null).length} with results
      </p>

      <div className="grid gap-2 lg:grid-cols-2">
        {shown.map((g, i) => (
          <GameCard key={i} g={g} />
        ))}
      </div>

      {!shown.length && (
        <div
          className="card px-4 py-14 text-center text-sm"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          No games match.
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
    <div className="card px-3.5 py-3">
      <div
        className="mb-2 flex items-center justify-between text-[11px]"
        style={{ color: "rgb(var(--text-faint))" }}
      >
        <span>{g.date ?? weekLabel(g)}</span>
        {played ? (
          <span className="chip !px-1.5" style={{ background: "rgb(var(--surface-3))" }}>
            Final
          </span>
        ) : (
          <span>Upcoming</span>
        )}
      </div>

      <Side
        name={g.t2}
        slug={g.t2Slug}
        cls={g.t2Class}
        score={g.s2}
        won={awayWon}
        played={played}
      />
      <Side
        name={g.t1}
        slug={g.t1Slug}
        cls={g.t1Class}
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
  score,
  won,
  played,
  home,
}: {
  name: string;
  slug: string | null;
  cls: Classification | null;
  score: number | null;
  won: boolean;
  played: boolean;
  home?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
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
          —
        </span>
      )}

      {slug ? (
        <Link
          href={`/team/${slug}`}
          className="min-w-0 flex-1 truncate text-[13px] font-semibold hover:underline"
          style={{ opacity: played && !won ? 0.6 : 1 }}
        >
          {name}
        </Link>
      ) : (
        <span
          className="min-w-0 flex-1 truncate text-[13px] font-semibold"
          style={{ opacity: played && !won ? 0.6 : 1 }}
        >
          {name}
        </span>
      )}

      {home && (
        <span
          className="text-[10px] font-semibold uppercase"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          home
        </span>
      )}

      {played && (
        <span
          className="w-8 shrink-0 text-right text-sm font-extrabold tnum"
          style={{ opacity: won ? 1 : 0.55 }}
        >
          {score}
        </span>
      )}
    </div>
  );
}
