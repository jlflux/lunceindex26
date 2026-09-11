/**
 * Chooses which engine builds the board.
 *
 * Two engines ship side by side so they can be compared on real data before
 * either is trusted with the public site:
 *
 *   classic  the modified Massey solver in engine.ts — one rating per team,
 *            derived from margins, with SOS and win-rate bolted on after.
 *   twoway   engine-twoway.ts — opponent-adjusted scoring offense and defense
 *            solved separately, rating = the difference.
 *
 * Against the 2025 season the two-way engine predicts better (82.7% on winners
 * against the classic engine's 73-ish on comparable holdouts) and lands much
 * closer to MaxPreps, Massey and HSRatings. It is NOT the default yet: the
 * default only moves when the board has been looked at week by week.
 */
import { computeRatings, type ComputeResult } from "./engine";
import { computeTwoWay } from "./engine-twoway";
import {
  DEFAULT_CONFIG,
  TWOWAY_DEFAULTS,
  type EngineConfig,
  type Game,
  type RatingModel,
  type Team,
} from "./types";

export function modelOf(config: Partial<EngineConfig>): RatingModel {
  return config.model === "twoway" ? "twoway" : "classic";
}

/**
 * Builds the board with whichever engine the config selects.
 *
 * Returns the same shape either way, so callers and the UI do not have to
 * know which one ran. Two-way rows carry extra `adj_o`, `adj_d` and `sor`
 * fields; classic rows leave them undefined.
 */
export function computeBoard(
  teams: Team[],
  games: Game[],
  config: Partial<EngineConfig> = {},
): ComputeResult {
  if (modelOf(config) === "twoway") {
    const cfg = { ...TWOWAY_DEFAULTS, ...(config.twoway ?? {}) };
    const r = computeTwoWay(teams, games, cfg);
    return {
      ratings: r.ratings,
      rpi: r.rpi,
      maxWeekPlayed: r.maxWeekPlayed,
      priorBlend: r.priorBlend,
    };
  }
  return computeRatings(teams, games, { ...DEFAULT_CONFIG, ...config });
}
