import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/db";
import type { Game } from "@/lib/types";

const ROUNDS = ["r1", "r2", "r3", "r4", "r5"];

/** Validates and normalises a game payload from the admin UI. */
function readGame(body: Record<string, unknown>): Partial<Game> {
  const t1 = String(body.t1 ?? "").trim();
  const t2 = String(body.t2 ?? "").trim();
  if (!t1 || !t2) throw new Error("Both teams are required.");
  if (t1 === t2) throw new Error("A team cannot play itself.");

  const type = body.type === "playoff" ? "playoff" : "regular";
  const round =
    type === "playoff" && ROUNDS.includes(String(body.round))
      ? (String(body.round) as Game["round"])
      : null;
  if (type === "playoff" && !round) {
    throw new Error("Playoff games need a round (r1–r5).");
  }

  const week = Number(body.week);
  if (!Number.isInteger(week) || week < 0 || week > 20) {
    throw new Error("Week must be a whole number between 0 and 20.");
  }

  // Empty string means "not played" — it must become null, not 0, or the
  // engine will read the game as a 0-0 tie.
  const score = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 200) {
      throw new Error("Scores must be whole numbers between 0 and 200.");
    }
    return n;
  };

  const s1 = score(body.s1);
  const s2 = score(body.s2);
  if ((s1 === null) !== (s2 === null)) {
    throw new Error(
      "Enter both scores or neither — a half-entered game would not count.",
    );
  }

  return {
    t1,
    t2,
    s1,
    s2,
    week,
    type,
    round,
    date: body.date ? String(body.date) : null,
    status: s1 !== null ? "final" : "scheduled",
    neutral_site: Boolean(body.neutral_site),
  };
}

export const POST = withAdmin(async (req: Request) => {
  const body = (await req.json()) as Record<string, unknown>;
  const game = readGame(body);

  const { data, error } = await serviceClient()
    .from("games")
    .upsert(game, { onConflict: "t1,t2,week,type" })
    .select()
    .single();
  if (error) throw new Error(error.message);

  return NextResponse.json({ ok: true, game: data });
});

export const PATCH = withAdmin(async (req: Request) => {
  const body = (await req.json()) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isInteger(id)) throw new Error("A game id is required.");

  const game = readGame(body);
  const { data, error } = await serviceClient()
    .from("games")
    .update(game)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  return NextResponse.json({ ok: true, game: data });
});

export const DELETE = withAdmin(async (req: Request) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) throw new Error("A game id is required.");

  const { error } = await serviceClient().from("games").delete().eq("id", id);
  if (error) throw new Error(error.message);

  return NextResponse.json({ ok: true });
});
