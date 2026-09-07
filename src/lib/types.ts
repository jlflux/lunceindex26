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

/**
 * Strength tier used for the rating baseline — deliberately NOT the same as
 * CLS_ORDER.
 *
 * CLS_ORDER is an identity and validation list, and its numbering puts A and
 * AA below 1A because that is where they sit in the roster listing. They are
 * not below 1A in playing strength: the private/independent split is a
 * different bracket rather than another rung on the public-school ladder, and
 * seeding them at the bottom would hand every A and AA school an unearned
 * penalty before a snap is played.
 *
 * AA sits between 4A and 5A, A between 2A and 3A — where the schools in them
 * actually play. Briarwood would have been a 5A school but for the split, and
 * being seeded a full tier below that is a penalty for a reclassification
 * rather than for anything on the field. Fractional tiers are fine: the
 * baseline interpolates.
 *
 * This only bites once results exist. With no games played the prior blend is
 * 1, meaning a team's carry-over rating is used whole and the class baseline
 * contributes nothing — so preseason ratings are unchanged by this map.
 */
export const CLS_TIER: Record<Classification, number> = {
  A: (CLS_ORDER["2A"] + CLS_ORDER["3A"]) / 2,
  AA: (CLS_ORDER["4A"] + CLS_ORDER["5A"]) / 2,
  "1A": CLS_ORDER["1A"],
  "2A": CLS_ORDER["2A"],
  "3A": CLS_ORDER["3A"],
  "4A": CLS_ORDER["4A"],
  "5A": CLS_ORDER["5A"],
  "6A": CLS_ORDER["6A"],
};

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
  /**
   * Extra weight on the carry-over while priorBlend is still decaying.
   *
   * Without it a single Week 0 result carries 78% of a team's rating, because
   * `prior_w` is 0.22 and the Massey solve is built to converge across a
   * season rather than be read after one game.
   */
  early_anchor: number;
  sos_w: number;
  /** Games before the schedule adjustment reaches full strength. */
  sos_ramp: number;
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
 * The weights that produced the 2025 season, recovered by fitting the
 * composite against all 387 teams in that export — PROJECT.md's own config
 * block lists sos_w 0.75 and wr_w 3.0, which do not reproduce what shipped.
 *
 * Kept as its own constant because DEFAULT_CONFIG has since moved away from
 * it. scripts/validate-2025.ts checks the engine against a finished season
 * and must keep using the weights that season was rated under, or it stops
 * testing the port and starts testing the current preferences.
 */
export const CONFIG_2025 = { sos_w: 0.9, wr_w: 6.0, cap: 28 } as const;

/**
 * Current defaults.
 *
 * sos_w and wr_w are lower than 2025's. Both were fitted against MaxPreps,
 * Massey and HSRatings on the 63 teams all four systems rank: each half of
 * that sample, fitted independently, picked lower values for both and the
 * gain held on the other half. The chosen point sits inside the range the two
 * halves agreed on rather than at either optimum, which were 0.5/2 and 0.4/1.
 *
 * The improvement is real but modest — mean rank difference from the other
 * three falls from about 24 places to 23, against 7-14 between those three.
 * Most of what remains is not reachable by these knobs.
 *
 * `cap` is since fitted a different and better way: rate on the weeks before
 * N, predict week N, score the predictions. Across 364 games of 2026 that
 * holdout is flat on picking winners for anything in 28-38 (73.4% vs 73.1%,
 * one game) but improves steadily on margin, so the tie is broken by margin
 * error. Agreement with the other three systems is the weaker target of the
 * two — they are fitting the same three weeks we are, and they lean on
 * preseason reputation, which is exactly what a young season cannot check.
 */
export const DEFAULT_CONFIG: EngineConfig = {
  prior_min: 0,
  prior_max: 14,
  prior_w: 0.22,
  // Weeks 0–3 only; identical to 0 from week four, so the 2025 validation is
  // unaffected either way.
  early_anchor: 0.8,
  sos_w: 0.6,
  sos_ramp: 4,
  eff_w: 0.07,
  wr_w: 3.0,
  // 28 recorded a 49-0 loss and a 28-0 loss as the same result, which is the
  // one thing a margin cap must not do to a five-touchdown game.
  //
  // The holdout does not pick a value on its own: margin error falls smoothly
  // all the way to 45 with no optimum inside the range, winner accuracy is
  // flat noise (72.5-73.4%, three games), and agreement with the other three
  // systems moves the other way. When two metrics disagree monotonically the
  // number has to come from what the cap is FOR — stopping a running-up
  // scoreline from being farmed, while still recording that five touchdowns
  // is worse than four. 35 is five touchdowns. 45 scores slightly better on
  // margin and would seat Hillcrest above Hewitt, but it is close enough to
  // no cap that a single 70-0 result starts driving a season, and five
  // disputed teams are not enough evidence to buy that.
  cap: 35,
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
