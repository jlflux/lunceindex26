// Shared domain types for the ALPreps Index rating engine and UI.

/** AHSAA 2026 reorganization: privates split into A / AA, publics 1A–6A. */
export const CLS_ORDER = {
  A: 1,
  AA: 2,
  "1A": 3,
  "2A": 4,
  "3A": 5,
  "4A": 6,
  "5A": 7,
  "6A": 8,
} as const;

export const CLS_MAX = 8;

export type Classification = keyof typeof CLS_ORDER;

/** Display order for filters: 6A down to 1A, then AA, then A. */
export const CLS_FILTER_ORDER: Classification[] = [
  "6A",
  "5A",
  "4A",
  "3A",
  "2A",
  "1A",
  "AA",
  "A",
];

export type PlayoffRound = "r1" | "r2" | "r3" | "r4" | "r5";

export const PLAYOFF_ROUND_LABELS: Record<PlayoffRound, string> = {
  r1: "First Round",
  r2: "Second Round",
  r3: "Quarterfinals",
  r4: "Semifinals",
  r5: "Championship",
};

export interface Team {
  id?: number;
  name: string;
  slug: string;
  classification: Classification;
  /** Region number within the classification, 1–8. */
  region: number;
  /** Carry-over rating from last season, already regressed toward class mean. */
  preseason_prior: number | null;
  /** Which prior-season team name the prior was drawn from, for auditing. */
  prior_source: string | null;
}

export interface Game {
  id?: number;
  /** Home team name. Null score means not yet played. */
  t1: string;
  s1: number | null;
  /** Away team name. May be an out-of-state school absent from `teams`. */
  t2: string;
  s2: number | null;
  week: number;
  type: "regular" | "playoff";
  round: PlayoffRound | null;
  date: string | null;
  /**
   * Informational only — the engine never reads this. Score presence is
   * authoritative for whether a game counts. See engine.ts step 0.
   */
  status: string | null;
  neutral_site?: boolean;
}

export interface EngineConfig {
  prior_min: number;
  prior_max: number;
  prior_w: number;
  sos_w: number;
  eff_w: number;
  wr_w: number;
  cap: number;
  iters: number;
  oos_mult: number;
  h2h_boost: number;
  h2h_frac: number;
  playoff_r1: number;
  playoff_r2: number;
  playoff_r3: number;
  playoff_r4: number;
  playoff_r5: number;
  /** Rating points added to the home side when projecting a margin. */
  hfa: number;
  /** |actual − expected| within this band counts as "as expected". */
  perf_expected_band: number;
  /** Beating the projection by more than this is "dominant". */
  perf_dominant_band: number;
}

/**
 * Defaults recovered from the 2025 season output, not from PROJECT.md — its
 * config block lists sos_w 0.75 and wr_w 3.0, which do not reproduce the
 * ratings that shipped. Fitting the composite against all 387 teams in the
 * 2025 export gives sos_w 0.90 and wr_w 6.0 to within rounding error.
 * See scripts/validate-2025.ts.
 */
export const DEFAULT_CONFIG: EngineConfig = {
  prior_min: 0,
  prior_max: 14,
  prior_w: 0.22,
  sos_w: 0.9,
  eff_w: 0.07,
  wr_w: 6.0,
  cap: 28,
  iters: 300,
  oos_mult: 1.3,
  h2h_boost: 2.5,
  h2h_frac: 0.45,
  playoff_r1: 1.2,
  playoff_r2: 1.4,
  playoff_r3: 1.6,
  playoff_r4: 1.8,
  playoff_r5: 2.0,
  hfa: 2.0,
  perf_expected_band: 7,
  perf_dominant_band: 21,
};

export interface RatingRow {
  name: string;
  slug: string;
  classification: Classification;
  region: number;
  wins: number;
  losses: number;
  rating: number;
  massey: number;
  sos: number;
  o_eff: number;
  d_eff: number;
  ppg: number;
  papg: number;
  prior_blend: number;
  rank: number;
  /** Rank within the team's own classification. */
  class_rank: number;
}

export interface RpiRow {
  name: string;
  slug: string;
  classification: Classification;
  region: number;
  wins: number;
  losses: number;
  win_pct: number;
  opp_win_pct: number;
  opp_opp_win_pct: number;
  rpi: number;
  rank: number;
  class_rank: number;
}

export interface RatingsPayload {
  generated: string;
  config: EngineConfig;
  ratings: RatingRow[];
  rpi: RpiRow[];
  games: Game[];
  max_week_played: number;
  prior_blend: number;
}
