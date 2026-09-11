import type { Game } from "./types";

export const fmt = (n: number, digits = 2) =>
  Number.isFinite(n) ? n.toFixed(digits) : "—";

/** Signed, for differentials where the direction is the point. */
/**
 * Signed, with the sign taken from the *rounded* value.
 *
 * Reading the sign off the raw number prints "−0" for anything that rounds
 * away to zero, e.g. a margin of −0.4 at zero decimals.
 */
export const fmtSigned = (n: number, digits = 1) => {
  const body = Math.abs(n).toFixed(digits);
  const zero = Number(body) === 0;
  return `${zero ? "" : n > 0 ? "+" : "−"}${body}`;
};

export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export const record = (w: number, l: number) => `${w}-${l}`;

export function weekLabel(g: Pick<Game, "week" | "type" | "round">): string {
  if (g.type === "playoff") {
    const labels: Record<string, string> = {
      r1: "Playoffs R1",
      r2: "Playoffs R2",
      r3: "Quarterfinals",
      r4: "Semifinals",
      r5: "Championship",
    };
    return g.round ? (labels[g.round] ?? "Playoffs") : "Playoffs";
  }
  return g.week === 0 ? "Week 0" : `Week ${g.week}`;
}

/** Ordinal suffix for ranks: 1st, 2nd, 3rd, 11th… */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Games a team needs before its efficiency figures are worth showing.
 *
 * Efficiency compares you with everyone else who played your opponents, so it
 * needs opponents who have played somebody else. After one week there is no
 * such baseline at all and every figure is 0.00; after two, each one rests on
 * a single other team's result. Three is where it starts averaging over
 * enough to mean something.
 *
 * Display only — the engine still uses whatever it computes, which is worth
 * well under a rating point either way.
 */
export const MIN_GAMES_FOR_EFFICIENCY = 3;

/**
 * Whether the public board shows offensive and defensive efficiency.
 *
 * Off. The two columns invite a reading they cannot support: they are a
 * comparison against what your opponents did to everyone else, so early in a
 * season they rest on one or two other teams' results and swing wildly, and
 * they are worth well under a rating point in the composite either way. A
 * number on the board looks authoritative whatever the note beside it says.
 *
 * A display switch only — the engine still computes efficiency and still uses
 * it (`eff_w`), and it stays in the published payload and on the admin side,
 * so flipping this back restores the columns with no other change.
 */
export const SHOW_EFFICIENCY = false;

/**
 * Games a team needs before its adjusted offence and defence are worth
 * showing.
 *
 * The two-way engine's NET rating is meaningful from the first week — it is
 * what the whole board is sorted by. The split between offence and defence is
 * not: with two games played the carry-over supplies roughly half of it, so
 * the figures follow the team's overall rating rather than its actual
 * scoring. Muscle Shoals through week two averaged four points a game and
 * showed an adjusted offence of fifty.
 *
 * Three games is where the team's own results outweigh the prior. The net
 * rating and the record are never gated — only the split.
 */
export const MIN_GAMES_FOR_SPLIT = 3;
