/**
 * The shape of the hand-authored bracket layer.
 *
 * Split out from `bracket.ts` so the admin client components can import the
 * types without dragging the resolver — and everything it reads — into the
 * browser bundle.
 *
 * The governing idea: this file describes only what a person typed. Records,
 * seed order and status are computed from the games and the ratings every time
 * the page renders, so none of them appear here. A number stored in this
 * document would be a second answer to a question the rest of the site already
 * answers, and the two would drift.
 */
import type { Classification } from "./types";

/**
 * Which place in which region — not which team.
 *
 * The whole design rests on this being late-bound. A slot says "whoever
 * finishes second in Region 4", and who that is gets worked out at render
 * time. Re-seed a region and every slot follows on its own; nothing in the
 * bracket has to be touched.
 */
export type SeedRef = { region: number; place: number };

/** A first-round slot. `null` is a bye. */
export type Slot = SeedRef | null;

export const STATUS_KEYS = [
  "clinched",
  "high",
  "medium",
  "low",
  "out",
  "ineligible",
] as const;
export type StatusKey = (typeof STATUS_KEYS)[number];

export const STATUS_LABELS: Record<StatusKey, string> = {
  clinched: "Clinched",
  high: "High",
  medium: "Medium",
  low: "Low",
  out: "Out",
  ineligible: "Barred",
};

/**
 * What a person writes about one game.
 *
 * Scores are not here. A playoff result is a game like any other and lives in
 * the `games` table, where it also counts toward the ratings — storing it
 * twice is how the two boards would come to disagree about a scoreline. What
 * remains is the material the games table has nowhere to put.
 */
export type GameEditorial = {
  /** Which side is at home. The games table records a neutral site, not this. */
  home?: "top" | "bottom";
  date?: string;
  time?: string;
  location?: string;
  note?: string;
};

export type RegionState = {
  /** The "Region picture" write-up shown under the standings table. */
  note: string;
  /**
   * A hand-pinned order, by team name, replacing the computed standings for
   * this region. Absent means "follow the math", which is the normal case —
   * and is what makes a forgotten pin findable rather than invisible.
   */
  order?: string[];
  /** Per-team status overrides. Sparse, for the same reason. */
  status?: Record<string, StatusKey>;
};

export type ClassState = {
  /** Region display order. Only ever used to generate default slots. */
  alignment: number[];
  /** The first round, in bracket order. This is where the seeds live. */
  slots: Slot[];
  /** Keyed by game id, `r{round}g{index}`. */
  results: Record<string, GameEditorial>;
  /** Hand-picked projected winners, keyed the same way. */
  projected: Record<string, "top" | "bottom">;
  /** Keyed by region number as a string. */
  regions: Record<string, RegionState>;
};

export type BracketState = {
  season: string;
  /** The notes-and-tiebreakers box at the top of the page. */
  newsNote: string;
  /** The explainer, as HTML. Sanitised on render. */
  aboutHtml: string;
  aboutBanner: { enabled: boolean; text: string };
  /**
   * Whether readers may see the projected bracket at all. Off by default, so
   * projections can be built privately and published deliberately.
   */
  showProjections: boolean;
  classes: Partial<Record<Classification, ClassState>>;
};

export function emptyBracketState(season = "2026"): BracketState {
  return {
    season,
    newsNote: "",
    aboutHtml: "",
    aboutBanner: { enabled: false, text: "" },
    showProjections: false,
    classes: {},
  };
}
