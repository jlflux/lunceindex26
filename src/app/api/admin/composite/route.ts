import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { loadComposite, loadTeams } from "@/lib/data";
import { serviceClient } from "@/lib/db";
import { COMPOSITE_SOURCES, type CompositeEntry } from "@/lib/rankings";

export const runtime = "nodejs";

export const GET = withAdmin(async () => {
  const [entries, teams] = await Promise.all([loadComposite(true), loadTeams(true)]);
  return NextResponse.json({
    ok: true,
    entries,
    teams: teams.map((t) => t.name).sort(),
  });
});

/** Highest rank worth accepting. Past this it is a typo, not a poll position. */
const MAX_RANK = 400;

/**
 * Replaces the whole board.
 *
 * A full replace rather than per-row edits because the editor works on the
 * table as a unit — dropping a team out of the 30 is as much an edit as
 * changing its number, and a PATCH-per-cell API cannot express the removal.
 */
export const PUT = withAdmin(async (req: Request) => {
  const body = (await req.json()) as { entries?: unknown };
  if (!Array.isArray(body.entries)) throw new Error("Expected a list of entries.");

  const known = new Set((await loadTeams(true)).map((t) => t.name));
  const seen = new Set<string>();
  const rows: CompositeEntry[] = [];

  for (const raw of body.entries as Record<string, unknown>[]) {
    const team = String(raw.team ?? "").trim();
    if (!team) continue; // a blank row in the editor is not an error
    if (!known.has(team)) {
      throw new Error(
        `"${team}" is not on the roster. Check the spelling, or add the team first.`,
      );
    }
    if (seen.has(team)) throw new Error(`${team} is listed twice.`);
    seen.add(team);

    const row: CompositeEntry = {
      team,
      maxpreps: null,
      massey: null,
      hsratings: null,
      ahsfhs: null,
    };
    for (const { key, label } of COMPOSITE_SOURCES) {
      const v = raw[key];
      if (v === undefined || v === null || v === "") continue;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > MAX_RANK) {
        throw new Error(
          `${team}: ${label} must be a whole number between 1 and ${MAX_RANK} (got "${String(v)}").`,
        );
      }
      row[key] = n;
    }
    rows.push(row);
  }

  const db = serviceClient();
  // Clearing first is what makes a removal stick. `neq` on a column that is
  // never null is the PostgREST way to say "every row".
  const { error: delErr } = await db.from("composite_ranks").delete().neq("team", "");
  if (delErr) throw new Error(delErr.message);

  if (rows.length) {
    const { error } = await db
      .from("composite_ranks")
      .insert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    if (error) throw new Error(error.message);
  }

  return NextResponse.json({ ok: true, saved: rows.length });
});
