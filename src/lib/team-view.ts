/**
 * Assembles everything a team profile shows: schedule, results, projected
 * margins and how each result compared with its projection.
 */
import { classifyPerformance, expectedMargin, isPlayed } from "./engine";
import type { Game, RatingRow, RatingsPayload, RpiRow } from "./types";
import type { Performance as Perf } from "./engine";

export interface ScheduleEntry {
  game: Game;
  opponent: string;
  /** Slug when the opponent is a rated team; null for out-of-state schools. */
  opponentSlug: string | null;
  opponentRating: number | null;
  opponentRank: number | null;
  isHome: boolean;
  played: boolean;
  teamScore: number | null;
  oppScore: number | null;
  won: boolean | null;
  /** Projected margin from this team's perspective. */
  expected: number | null;
  /** Actual margin from this team's perspective. */
  actual: number | null;
  performance: Perf | null;
}

export interface TeamView {
  rating: RatingRow;
  rpi: RpiRow | null;
  schedule: ScheduleEntry[];
}

export function buildTeamView(
  payload: RatingsPayload,
  slug: string,
): TeamView | null {
  const rating = payload.ratings.find((r) => r.slug === slug);
  if (!rating) return null;

  const byName = new Map(payload.ratings.map((r) => [r.name, r]));
  const cfg = payload.config;

  const schedule = payload.games
    .filter((g) => g.t1 === rating.name || g.t2 === rating.name)
    .map<ScheduleEntry>((game) => {
      const isHome = game.t1 === rating.name;
      const opponent = isHome ? game.t2 : game.t1;
      const opp = byName.get(opponent) ?? null;
      const played = isPlayed(game);

      const teamScore = played ? Number(isHome ? game.s1 : game.s2) : null;
      const oppScore = played ? Number(isHome ? game.s2 : game.s1) : null;

      // Projection needs a rated opponent; out-of-state schools have none.
      let expected: number | null = null;
      if (opp) {
        const homeMargin = expectedMargin(
          isHome ? rating.rating : opp.rating,
          isHome ? opp.rating : rating.rating,
          cfg,
          game.neutral_site ?? false,
        );
        expected = isHome ? homeMargin : -homeMargin;
      }

      const actual =
        teamScore !== null && oppScore !== null ? teamScore - oppScore : null;

      let performance: Perf | null = null;
      if (actual !== null && expected !== null) {
        performance = classifyPerformance(actual, expected, cfg);
      }

      return {
        game,
        opponent,
        opponentSlug: opp?.slug ?? null,
        opponentRating: opp?.rating ?? null,
        opponentRank: opp?.rank ?? null,
        isHome,
        played,
        teamScore,
        oppScore,
        won: actual === null ? null : actual > 0,
        expected,
        actual,
        performance,
      };
    })
    .sort((a, b) => {
      // Regular season by week, then playoff rounds in order.
      const key = (e: ScheduleEntry) =>
        e.game.type === "playoff"
          ? 100 + Number((e.game.round ?? "r0").slice(1))
          : e.game.week;
      return key(a) - key(b);
    });

  return {
    rating,
    rpi: payload.rpi.find((r) => r.slug === slug) ?? null,
    schedule,
  };
}

export const PERFORMANCE_LABELS: Record<Perf, string> = {
  dominant: "Dominant",
  exceeded: "Exceeded",
  "as-expected": "As expected",
  below: "Below expectation",
};
