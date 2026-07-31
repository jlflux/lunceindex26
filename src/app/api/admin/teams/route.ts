import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
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

  return {
    name,
    slug: slugify(name),
    classification,
    region,
    preseason_prior,
    prior_source: body.prior_source ? String(body.prior_source) : null,
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
