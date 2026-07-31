import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { loadAliases, loadTeams } from "@/lib/data";
import { serviceClient } from "@/lib/db";
import { parseCsvText } from "@/lib/csv";
import { previewScoreCsv, type ScoreRow } from "@/lib/score-csv";
import type { Game } from "@/lib/types";

/** Dry run: parse and match, write nothing. */
export const POST = withAdmin(async (req: Request) => {
  const body = (await req.json()) as {
    csv?: string;
    week?: number;
    type?: "regular" | "playoff";
    round?: Game["round"];
  };
  if (!body.csv?.trim()) throw new Error("Paste or upload a CSV first.");

  const [teams, aliases] = await Promise.all([loadTeams(true), loadAliases()]);
  const preview = previewScoreCsv(
    parseCsvText(body.csv),
    teams,
    {
      week: Number(body.week ?? 0),
      type: body.type === "playoff" ? "playoff" : "regular",
      round: body.round ?? null,
    },
    aliases,
  );

  return NextResponse.json({ ...preview, ok: true });
});

/** Commits the rows the admin confirmed. */
export const PUT = withAdmin(async (req: Request) => {
  const body = (await req.json()) as { rows?: ScoreRow[] };
  const rows = (body.rows ?? []).filter((r) => !r.error && r.home && r.away);
  if (!rows.length) throw new Error("Nothing to import.");

  const games = rows.map((r) => ({
    t1: r.home as string,
    t2: r.away as string,
    s1: r.homeScore,
    s2: r.awayScore,
    week: r.week,
    type: r.type,
    round: r.round,
    status: r.homeScore !== null ? "final" : "scheduled",
  }));

  // Upsert on the natural key so re-importing a corrected file updates the
  // existing games rather than duplicating the week.
  const { error, count } = await serviceClient()
    .from("games")
    .upsert(games, { onConflict: "t1,t2,week,type", count: "exact" });
  if (error) throw new Error(error.message);

  return NextResponse.json({ ok: true, imported: count ?? games.length });
});
