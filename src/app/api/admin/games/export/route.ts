import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { loadGames } from "@/lib/data";

export const runtime = "nodejs";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Every game as CSV.
 *
 * Exists so the season can be reproduced outside the database — for a backup,
 * and for tuning the formula against other rating systems, which needs the
 * real schedule and the real results rather than a plausible imitation.
 */
export const GET = withAdmin(async () => {
  const games = await loadGames(true);
  const header = "home,home_score,away,away_score,week,type,round,date,status";
  const body = games
    .map((g) =>
      [
        g.t1,
        g.s1,
        g.t2,
        g.s2,
        g.week,
        g.type,
        g.round,
        g.date,
        g.status,
      ]
        .map(cell)
        .join(","),
    )
    .join("\n");

  return new NextResponse(`${header}\n${body}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="alpreps-games.csv"`,
    },
  });
});
