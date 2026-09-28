import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { removalImpact, withoutTeam } from "@/lib/bracket";
import { loadBracket, loadTeams, saveBracket } from "@/lib/data";
import { serviceClient } from "@/lib/db";
import { slugify } from "@/lib/names";
import { CLS_ORDER, type Classification } from "@/lib/types";

function readTeam(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  if (!name) throw new Error("Team name is required.");

  const classification = String(body.classification ?? "") as Classification;
  if (!(classification in CLS_ORDER)) {
    throw new Error(`Unknown classification "${classification}".`);
  }

  const region = Number(body.region);
  if (!Number.isInteger(region) || region < 1 || region > 8) {
    throw new Error("Region must be between 1 and 8.");
  }

  const priorRaw = body.preseason_prior;
  const preseason_prior =
    priorRaw === null || priorRaw === undefined || priorRaw === ""
      ? null
      : Number(priorRaw);
  if (preseason_prior !== null && !Number.isFinite(preseason_prior)) {
    throw new Error("Preseason prior must be a number, or left empty.");
  }

  // A postseason ban voids the team's region schedule for everyone it plays
  // and keeps it out of the bracket. It never touches the rating. The note is
  // free text for why and when — documentation, read by nothing but the team
  // page — so it is trimmed and otherwise taken as given.
  const note = String(body.postseason_note ?? "").trim();

  return {
    name,
    slug: slugify(name),
    classification,
    region,
    preseason_prior,
    prior_source: body.prior_source ? String(body.prior_source) : null,
    postseason_ineligible: body.postseason_ineligible === true,
    postseason_note: note || null,
  };
}

export const POST = withAdmin(async (req: Request) => {
  const team = readTeam((await req.json()) as Record<string, unknown>);
  const { data, error } = await serviceClient()
    .from("teams")
    .upsert(team, { onConflict: "name" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return NextResponse.json({ ok: true, team: data });
});

export const PATCH = withAdmin(async (req: Request) => {
  const body = (await req.json()) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isInteger(id)) throw new Error("A team id is required.");

  const db = serviceClient();
  const { data: before, error: readErr } = await db
    .from("teams")
    .select("name")
    .eq("id", id)
    .single();
  if (readErr) throw new Error(readErr.message);

  const team = readTeam(body);
  const { data, error } = await db
    .from("teams")
    .update(team)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Games reference teams by name, so a rename has to carry through or the
  // team's schedule silently detaches.
  let gamesUpdated = 0;
  if (before.name !== team.name) {
    for (const col of ["t1", "t2"] as const) {
      const { data: rows, error: gErr } = await db
        .from("games")
        .update({ [col]: team.name })
        .eq(col, before.name)
        .select("id");
      if (gErr) throw new Error(gErr.message);
      gamesUpdated += rows?.length ?? 0;
    }
  }

  return NextResponse.json({
    ok: true,
    team: data,
    renamedFrom: before.name !== team.name ? before.name : null,
    gamesUpdated,
  });
});

/**
 * Removes a team, and everything that would be left pointing at it.
 *
 * Deleting the row alone is not a smaller version of this — it is a different
 * and worse outcome. The engine prices any name it cannot find on the roster
 * off the field mean, which is how an out-of-state opponent works, so a team
 * whose row is gone but whose games remain does not disappear: its fixtures
 * quietly become out-of-state ones, its opponents keep the win-loss and lose
 * the region result. That is why `withGames` exists and why the route refuses
 * without it rather than doing half the job.
 *
 * Everything is counted before anything is touched, and the count comes back
 * with the refusal so the confirmation can say what it is confirming.
 */
export const DELETE = withAdmin(async (req: Request) => {
  const body = (await req.json()) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isInteger(id)) throw new Error("A team id is required.");
  const withGames = body.withGames === true;

  const db = serviceClient();
  const { data: team, error: readErr } = await db
    .from("teams")
    .select("id, name, classification, region")
    .eq("id", id)
    .single();
  if (readErr) throw new Error(readErr.message);
  const name = team.name as string;

  // ---- count first, touch nothing -----------------------------------------
  // Two equality filters rather than one `.or()`: that filter is a
  // comma-delimited list, so a school whose name contained a comma or a
  // bracket would slip out of its own query and take the wrong games with it.
  // No name on the roster does today. Equality needs no escaping ever.
  const [t1Res, t2Res, aliasRes, compRes, aswaRes] = await Promise.all([
    db.from("games").select("id", { count: "exact", head: true }).eq("t1", name),
    db.from("games").select("id", { count: "exact", head: true }).eq("t2", name),
    db.from("team_aliases").select("id", { count: "exact", head: true })
      .eq("team_id", id),
    db.from("composite_ranks").select("team", { count: "exact", head: true })
      .eq("team", name),
    db.from("aswa_ranks").select("id", { count: "exact", head: true })
      .eq("team", name),
  ]);
  // A team never plays itself, so the two cannot double-count.
  const games = (t1Res.count ?? 0) + (t2Res.count ?? 0);
  const counts = {
    games,
    aliases: aliasRes.count ?? 0,
    composite: compRes.count ?? 0,
    aswa: aswaRes.count ?? 0,
  };

  if (games > 0 && !withGames) {
    return NextResponse.json({
      ok: false,
      needsConfirm: true,
      team: name,
      counts,
      error:
        `${name} has ${games} game${games === 1 ? "" : "s"} on file. Removing ` +
        `the team without them would not erase it — the engine treats an ` +
        `unknown name as an out-of-state school, so those games would stay ` +
        `and stop counting as region games for the opponents. Confirm to ` +
        `remove the games too.`,
    }, { status: 409 });
  }

  // A slot points at a place, not a name, so the risk is a region becoming
  // shorter than a place some slot still reaches.
  const [state, teams] = await Promise.all([loadBracket(true), loadTeams(true)]);
  const ratings = teams.map((t) => ({
    name: t.name,
    classification: t.classification,
    region: t.region,
  }));
  const impact = removalImpact(state, ratings, name);
  if (impact.dangling.length) {
    return NextResponse.json({
      ok: false,
      team: name,
      error:
        `Removing ${name} would leave ${team.classification} Region ` +
        `${team.region} with fewer teams than the bracket expects: ` +
        `${impact.dangling.join(", ")} would point at nobody. Rearrange those ` +
        `slots first.`,
    }, { status: 409 });
  }

  // ---- remove, widest first ------------------------------------------------
  if (withGames && games) {
    for (const col of ["t1", "t2"] as const) {
      const { error } = await db.from("games").delete().eq(col, name);
      if (error) throw new Error(error.message);
    }
  }
  for (const [table, column] of [
    ["composite_ranks", "team"],
    ["aswa_ranks", "team"],
  ] as const) {
    // These key on the name and would otherwise be left pointing at nothing.
    // A missing table means the migration has not run here, which is not a
    // reason to abandon the delete half-done.
    const { error } = await db.from(table).delete().eq(column, name);
    if (error && !/does not exist/i.test(error.message)) {
      throw new Error(error.message);
    }
  }
  // Cascades to team_aliases.
  const { error: delErr } = await db.from("teams").delete().eq("id", id);
  if (delErr) throw new Error(delErr.message);

  if (impact.overrides.length || impact.pins.length) {
    await saveBracket(withoutTeam(state, name));
  }

  return NextResponse.json({
    ok: true,
    team: name,
    counts,
    tidied: { overrides: impact.overrides, pins: impact.pins },
  });
});
