"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Icon from "./Icon";
import { ordinal, record } from "@/lib/format";
import type { RatingRow } from "@/lib/types";

/**
 * Find one school out of 393.
 *
 * On the front page this is the shortest path to what most people came for —
 * their own team — so it sits above the navigation rather than inside it. The
 * board has its own filter bar and does not need this; the front page has no
 * table to filter, so here it navigates instead.
 *
 * Matching is a plain substring on the name, which is what people type. The
 * matcher in `names.ts` is for reconciling the association's spellings against
 * the roster and is far too permissive for a search box — it would answer
 * "Hoover" for "Hoo" and also for "Haver".
 */
export default function TeamJump({ teams }: { teams: RatingRow[] }) {
  const [q, setQ] = useState("");
  const router = useRouter();

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const starts: RatingRow[] = [];
    const contains: RatingRow[] = [];
    for (const t of teams) {
      const name = t.name.toLowerCase();
      // A school whose name begins with what was typed is almost always the
      // one meant, so those come first rather than being buried in rank order.
      if (name.startsWith(needle)) starts.push(t);
      else if (name.includes(needle)) contains.push(t);
    }
    return [...starts, ...contains].slice(0, 7);
  }, [q, teams]);

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (hits[0]) router.push(`/team/${hits[0].slug}`);
        }}
      >
        <span
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          <Icon name="search" size={16} />
        </span>
        <input
          type="search"
          className="input !py-2.5 !pl-10 !text-[14px]"
          placeholder="Find a team — try Thompson, Saraland, Clay-Chalkville…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Find a team"
        />
      </form>

      {hits.length > 0 && (
        <ul
          className="card card-lift absolute z-20 mt-1.5 w-full overflow-hidden"
          style={{ borderColor: "rgb(var(--border-strong))" }}
        >
          {hits.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/team/${t.slug}`}
                className="row-hover flex items-center justify-between gap-3 px-3.5 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`chip cls-${t.classification}`}>
                    {t.classification}
                  </span>
                  <span className="truncate text-[13.5px] font-semibold">
                    {t.name}
                  </span>
                </span>
                <span
                  className="shrink-0 text-[12px] tnum"
                  style={{ color: "rgb(var(--text-muted))" }}
                >
                  {ordinal(t.rank)} · {record(t.wins, t.losses)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {q.trim() && hits.length === 0 && (
        <div
          className="card absolute z-20 mt-1.5 w-full px-3.5 py-3 text-[13px]"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          No school by that name.
        </div>
      )}
    </div>
  );
}
