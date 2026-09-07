import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { loadAliases, loadTeams } from "@/lib/data";
import { serviceClient } from "@/lib/db";
import { parseSchedulePdf } from "@/lib/schedule-pdf";
import type { Game } from "@/lib/types";

// pdf.js needs the Node runtime, not Edge.
export const runtime = "nodejs";
export const maxDuration = 60;

/** Dry run: parse the uploaded PDF and report what would be imported. */
export const POST = withAdmin(async (req: Request) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Attach a schedule PDF.");

  const [teams, aliases] = await Promise.all([loadTeams(true), loadAliases()]);
  const report = await parseSchedulePdf(
    new Uint8Array(await file.arrayBuffer()),
    teams,
    aliases,
  );

  return NextResponse.json({
    ok: true,
    totalRows: report.totalRows,
    warnings: report.warnings,
    duplicates: report.duplicates,
    skipped: report.skipped,
    games: report.games.map((g) => ({
      date: g.date,
      home: g.home.name,
      away: g.away.name,
      homeMethod: g.home.method,
      awayMethod: g.away.method,
      homeRaw: g.home.raw,
      awayRaw: g.away.raw,
      outOfState: g.home.outOfState || g.away.outOfState,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      location: g.location,
    })),
  });
});

interface ConfirmGame {
  home: string;
  away: string;
  date?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
}

/**
 * Commits the parsed sheet.
 *
 * The same document serves as a forward schedule and as a results sheet — the
 * later ones carry score columns — so scores are written when the sheet has
 * them. A score already in the database is never overwritten: where the sheet
 * disagrees it is reported instead, because replacing a corrected result with
 * the one it was corrected from is the worse failure.
 */
export const PUT = withAdmin(async (req: Request) => {
  const body = (await req.json()) as {
    games?: ConfirmGame[];
    week?: number;
    type?: "regular" | "playoff";
    round?: Game["round"];
  };

  const games = body.games ?? [];
  if (!games.length) throw new Error("Nothing to import.");

  const week = Number(body.week);
  if (!Number.isInteger(week) || week < 0 || week > 20) {
    throw new Error("Choose a week between 0 and 20.");
  }
  const type = body.type === "playoff" ? "playoff" : "regular";
  const round = type === "playoff" ? (body.round ?? null) : null;
  if (type === "playoff" && !round) {
    throw new Error("Playoff imports need a round.");
  }

  const db = serviceClient();

  // Find which of these matchups already exist so scored games are untouched.
  const { data: existing, error: readErr } = await db
    .from("games")
    .select("t1, t2, week, type, s1, s2")
    .eq("week", week)
    .eq("type", type);
  if (readErr) throw new Error(readErr.message);

  const onFile = new Map<string, Game>();
  for (const g of (existing ?? []) as Game[]) {
    onFile.set(`${g.t1}|${g.t2}`, g);
  }

  const conflicts: string[] = [];
  let scored = 0;
  let skippedPlayed = 0;

  const toInsert: Record<string, unknown>[] = [];
  for (const g of games) {
    if (!g.home || !g.away) continue;
    const current = onFile.get(`${g.home}|${g.away}`);
    const held = current && current.s1 !== null && current.s2 !== null;
    const hasScore =
      g.homeScore !== null &&
      g.homeScore !== undefined &&
      g.awayScore !== null &&
      g.awayScore !== undefined;

    if (held) {
      skippedPlayed++;
      if (hasScore && (current.s1 !== g.homeScore || current.s2 !== g.awayScore)) {
        conflicts.push(
          `${g.home} ${current.s1}–${current.s2} ${g.away} on file, sheet says ${g.homeScore}–${g.awayScore}`,
        );
      }
      continue;
    }

    if (hasScore) scored++;
    toInsert.push({
      t1: g.home,
      t2: g.away,
      s1: hasScore ? g.homeScore : null,
      s2: hasScore ? g.awayScore : null,
      week,
      type,
      round,
      date: g.date ?? null,
      status: hasScore ? "final" : "scheduled",
    });
  }

  if (toInsert.length) {
    const { error } = await db
      .from("games")
      .upsert(toInsert, { onConflict: "t1,t2,week,type" });
    if (error) throw new Error(error.message);
  }

  return NextResponse.json({
    ok: true,
    imported: toInsert.length,
    scored,
    skippedAlreadyPlayed: skippedPlayed,
    conflicts,
  });
});
