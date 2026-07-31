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
      location: g.location,
    })),
  });
});

interface ConfirmGame {
  home: string;
  away: string;
  date?: string | null;
}

/**
 * Commits the parsed schedule. Scores are never written here, and existing
 * games are left alone — importing a schedule must not wipe results that are
 * already entered.
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

  const played = new Set(
    ((existing ?? []) as Game[])
      .filter((g) => g.s1 !== null && g.s2 !== null)
      .map((g) => `${g.t1}|${g.t2}`),
  );

  const toInsert = games
    .filter((g) => g.home && g.away && !played.has(`${g.home}|${g.away}`))
    .map((g) => ({
      t1: g.home,
      t2: g.away,
      s1: null,
      s2: null,
      week,
      type,
      round,
      date: g.date ?? null,
      status: "scheduled",
    }));

  const skippedPlayed = games.length - toInsert.length;

  if (toInsert.length) {
    const { error } = await db
      .from("games")
      .upsert(toInsert, { onConflict: "t1,t2,week,type" });
    if (error) throw new Error(error.message);
  }

  return NextResponse.json({
    ok: true,
    imported: toInsert.length,
    skippedAlreadyPlayed: skippedPlayed,
  });
});
