import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { computeRatings } from "@/lib/engine";
import { loadConfig, loadGames, loadTeams, saveConfig } from "@/lib/data";
import { DEFAULT_CONFIG, type EngineConfig } from "@/lib/types";

/** Sane bounds for every tunable, so a slider cannot produce nonsense. */
const BOUNDS: Record<keyof EngineConfig, [number, number]> = {
  prior_min: [-20, 40],
  prior_max: [-20, 60],
  prior_w: [0, 1],
  early_anchor: [0, 1],
  sos_w: [0, 3],
  eff_w: [0, 1],
  wr_w: [0, 20],
  cap: [7, 70],
  iters: [10, 1000],
  oos_mult: [0, 3],
  h2h_boost: [0, 20],
  h2h_frac: [0, 1],
  playoff_r1: [1, 3],
  playoff_r2: [1, 3],
  playoff_r3: [1, 3],
  playoff_r4: [1, 3],
  playoff_r5: [1, 3],
  hfa: [0, 10],
  perf_expected_band: [1, 30],
  perf_dominant_band: [2, 60],
};

function readConfig(body: Record<string, unknown>): EngineConfig {
  const out = { ...DEFAULT_CONFIG };
  for (const key of Object.keys(BOUNDS) as (keyof EngineConfig)[]) {
    const raw = body[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${key} must be a number.`);
    const [lo, hi] = BOUNDS[key];
    if (n < lo || n > hi) {
      throw new Error(`${key} must be between ${lo} and ${hi}.`);
    }
    out[key] = key === "iters" ? Math.round(n) : n;
  }
  if (out.perf_dominant_band <= out.perf_expected_band) {
    throw new Error(
      "The dominant band must be larger than the as-expected band.",
    );
  }
  return out;
}

export const POST = withAdmin(async (req: Request) => {
  const body = (await req.json()) as Record<string, unknown>;
  const config = readConfig(body);
  await saveConfig(config);
  // Saving does not publish — the admin previews first, then publishes.
  return NextResponse.json({ ok: true, config });
});

/**
 * Previews a config against current data without saving, so sliders can be
 * tuned against a live top-25 before anything goes public.
 */
export const PUT = withAdmin(async (req: Request) => {
  const body = (await req.json()) as Record<string, unknown>;
  const config = readConfig(body);

  const [teams, games] = await Promise.all([loadTeams(true), loadGames(true)]);
  const result = computeRatings(teams, games, config);

  const saved = await loadConfig(true);
  const current = computeRatings(teams, games, saved);
  const currentRank = new Map(current.ratings.map((r) => [r.name, r.rank]));

  return NextResponse.json({
    ok: true,
    priorBlend: result.priorBlend,
    top: result.ratings.slice(0, 25).map((r) => ({
      rank: r.rank,
      name: r.name,
      slug: r.slug,
      classification: r.classification,
      rating: Number(r.rating.toFixed(2)),
      record: `${r.wins}-${r.losses}`,
      // How far this team moves versus the saved config.
      delta: (currentRank.get(r.name) ?? r.rank) - r.rank,
    })),
  });
});
