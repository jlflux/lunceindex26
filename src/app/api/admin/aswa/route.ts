import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { loadAswa, loadTeams } from "@/lib/data";
import { serviceClient } from "@/lib/db";
import { ASWA_TOP, type AswaEntry } from "@/lib/rankings";
import { CLS_FILTER_ORDER } from "@/lib/types";

export const runtime = "nodejs";

export const GET = withAdmin(async () => {
  const [entries, teams] = await Promise.all([loadAswa(true), loadTeams(true)]);
  return NextResponse.json({
    ok: true,
    entries,
    teams: teams.map((t) => ({ name: t.name, classification: t.classification })),
  });
});

const num = (v: unknown, label: string, max: number): number => {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) {
    throw new Error(`${label} must be a whole number between 0 and ${max}.`);
  }
  return n;
};

/**
 * Replaces one classification's poll.
 *
 * Scoped to a single class because that is how the poll is released and how it
 * gets typed in — saving 6A must not require 1A to be on screen, and a partial
 * save of everything would be the easy way to wipe a class by accident.
 */
export const PUT = withAdmin(async (req: Request) => {
  const body = (await req.json()) as {
    classification?: string;
    entries?: unknown;
  };
  const cls = String(body.classification ?? "");
  if (!CLS_FILTER_ORDER.includes(cls as never)) {
    throw new Error(`Unknown classification "${cls}".`);
  }
  if (!Array.isArray(body.entries)) throw new Error("Expected a list of entries.");

  const known = new Set((await loadTeams(true)).map((t) => t.name));
  const seen = new Set<string>();
  const rows: AswaEntry[] = [];

  for (const raw of body.entries as Record<string, unknown>[]) {
    const team = String(raw.team ?? "").trim();
    if (!team) continue;
    if (!known.has(team)) {
      throw new Error(`"${team}" is not on the roster. Check the spelling.`);
    }
    if (seen.has(team)) throw new Error(`${team} is listed twice in ${cls}.`);
    seen.add(team);

    // A blank rank means the team is in "others receiving votes" rather than
    // the ten, which is a real state and not a missing value.
    let rank: number | null = null;
    if (raw.rank !== undefined && raw.rank !== null && raw.rank !== "") {
      const n = Number(raw.rank);
      if (!Number.isInteger(n) || n < 1 || n > ASWA_TOP) {
        throw new Error(`${team}: rank must be between 1 and ${ASWA_TOP}.`);
      }
      rank = n;
    }

    rows.push({
      classification: cls,
      rank,
      team,
      wins: num(raw.wins, `${team} wins`, 30),
      losses: num(raw.losses, `${team} losses`, 30),
      first_votes: num(raw.first_votes, `${team} first-place votes`, 100),
      points: num(raw.points, `${team} points`, 10000),
    });
  }

  const ranked = rows.filter((r) => r.rank !== null).map((r) => r.rank as number);
  const dupe = ranked.find((r, i) => ranked.indexOf(r) !== i);
  if (dupe !== undefined) {
    throw new Error(`Two teams are both ranked ${dupe} in ${cls}.`);
  }

  const db = serviceClient();
  const { error: delErr } = await db
    .from("aswa_ranks")
    .delete()
    .eq("classification", cls);
  if (delErr) throw new Error(delErr.message);

  if (rows.length) {
    const { error } = await db
      .from("aswa_ranks")
      .insert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    if (error) throw new Error(error.message);
  }

  return NextResponse.json({ ok: true, classification: cls, saved: rows.length });
});
