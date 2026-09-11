/**
 * Loading domain data and publishing rating snapshots.
 *
 * The public site reads a cached snapshot rather than recomputing on every
 * request — a 300-iteration solve over a full season is not something to run
 * per page view. Any admin write that changes the inputs republishes.
 */
import "server-only";

import { computeBoard } from "./board";
import { publicClient, serviceClient } from "./db";
import {
  DEFAULT_CONFIG,
  type EngineConfig,
  type Game,
  type RatingsPayload,
  type Team,
} from "./types";

/** Supabase caps a single select at 1000 rows; page through it. */
async function selectAll<T>(
  client: ReturnType<typeof publicClient>,
  table: string,
  order: string,
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .order(order)
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) break;
  }
  return out;
}

export async function loadTeams(admin = false): Promise<Team[]> {
  const c = admin ? serviceClient() : publicClient();
  return selectAll<Team>(c, "teams", "name");
}

export async function loadGames(admin = false): Promise<Game[]> {
  const c = admin ? serviceClient() : publicClient();
  return selectAll<Game>(c, "games", "id");
}

export async function loadConfig(admin = false): Promise<EngineConfig> {
  const c = admin ? serviceClient() : publicClient();
  const { data } = await c.from("config").select("data").eq("id", 1).maybeSingle();
  // Merging over defaults means a config saved before a new knob existed
  // still loads, rather than yielding undefined mid-solve.
  return { ...DEFAULT_CONFIG, ...((data?.data as Partial<EngineConfig>) ?? {}) };
}

export async function saveConfig(config: EngineConfig): Promise<void> {
  const { error } = await serviceClient()
    .from("config")
    .upsert({ id: 1, data: config, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Saving config: ${error.message}`);
}

/** Recomputes ratings from current data and caches the result. */
export async function publishRatings(): Promise<RatingsPayload> {
  const [teams, games, config] = await Promise.all([
    loadTeams(true),
    loadGames(true),
    loadConfig(true),
  ]);

  const result = computeBoard(teams, games, config);
  const payload: RatingsPayload = {
    generated: new Date().toISOString(),
    config,
    ratings: result.ratings,
    rpi: result.rpi,
    // The full games array rides along so team pages can render schedules
    // without a second round trip.
    games,
    max_week_played: result.maxWeekPlayed,
    prior_blend: result.priorBlend,
  };

  const { error } = await serviceClient()
    .from("ratings_snapshot")
    .upsert({ id: 1, payload, generated: payload.generated });
  if (error) throw new Error(`Publishing ratings: ${error.message}`);

  return payload;
}

function emptyPayload(): RatingsPayload {
  return {
    generated: new Date().toISOString(),
    config: DEFAULT_CONFIG,
    ratings: [],
    rpi: [],
    games: [],
    max_week_played: 0,
    prior_blend: 1,
  };
}

/**
 * The public read path. Falls back to computing on the fly if no snapshot
 * exists yet, so a fresh deploy is never a blank page.
 *
 * Never throws. The homepage is prerendered at build time, and a database
 * that is unreachable or not yet provisioned would otherwise fail the whole
 * build rather than showing an empty board.
 */
export async function loadRatings(): Promise<RatingsPayload> {
  // Local preview: renders the real UI against a generated payload without a
  // database. Set by `npm run preview`; never used in production.
  const previewPath = process.env.ALPREPS_PREVIEW_DATA;
  if (previewPath) {
    const { readFileSync } = await import("node:fs");
    return JSON.parse(readFileSync(previewPath, "utf8")) as RatingsPayload;
  }

  try {
    const { data } = await publicClient()
      .from("ratings_snapshot")
      .select("payload")
      .eq("id", 1)
      .maybeSingle();

    if (data?.payload) return data.payload as RatingsPayload;
  } catch {
    return emptyPayload();
  }

  try {
    const [teams, games, config] = await Promise.all([
      loadTeams(),
      loadGames(),
      loadConfig(),
    ]);
    const result = computeBoard(teams, games, config);
    return {
      generated: new Date().toISOString(),
      config,
      ratings: result.ratings,
      rpi: result.rpi,
      games,
      max_week_played: result.maxWeekPlayed,
      prior_blend: result.priorBlend,
    };
  } catch {
    return emptyPayload();
  }
}

/**
 * Schools that play a schedule but hold no rating: independents, AISA
 * programs, anyone off the classification list.
 *
 * Falls back to an empty list rather than throwing, so a deployment whose
 * migration has not been run yet keeps importing — it simply reports these
 * names as unmatched, exactly as it did before the table existed.
 */
export async function loadNonMembers(): Promise<string[]> {
  const { data, error } = await serviceClient()
    .from("non_members")
    .select("name");
  if (error) return [];
  return ((data ?? []) as { name: string }[]).map((r) => r.name);
}

/** Admin-resolved PDF name aliases, keyed by the raw PDF spelling. */
export async function loadAliases(): Promise<Record<string, string>> {
  const { data, error } = await serviceClient()
    .from("team_aliases")
    .select("alias, teams(name)");
  if (error) throw new Error(`Loading aliases: ${error.message}`);

  // The embedded relation comes back as an array or an object depending on
  // how PostgREST resolves the foreign key; normalise both.
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as unknown as {
    alias: string;
    teams: { name: string } | { name: string }[] | null;
  }[]) {
    const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
    if (team?.name) out[row.alias] = team.name;
  }
  return out;
}
