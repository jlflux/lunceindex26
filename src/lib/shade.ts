/**
 * How a probability becomes an amount of colour.
 *
 * Here rather than in the component because it is a rule with an invariant, and
 * the invariant is the whole point: within a column, a bigger number never gets
 * less ink than a smaller one. That was violated for a season and the board read
 * backwards — see `magnitude` below — so it is worth a test rather than a
 * comment.
 */

/** What a pill needs: which end of the scale, and how far along it. */
export type Shade = {
  /** The good end (blue) rather than the bad one (red). */
  hot: boolean;
  /** 0 = flat, 1 = as strong as this scale goes. */
  strength: number;
};

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/**
 * A column with a wrong side: blue above an even chance, red below it.
 *
 * Measured against a flat one-half rather than against the best team in the
 * column, because an even chance at the thing means the same in every region in
 * the state. The playoff column is the only one on the board that qualifies —
 * it is the only one with a line under it.
 */
export function polarity(v: number): Shade {
  const p = clamp(v);
  return { hot: p >= 0.5, strength: Math.abs(p - 0.5) * 2 };
}

/**
 * A one-sided column: more of the number is more colour, and none of it is
 * none.
 *
 * Seeds, rounds and the championship are all this. No team is on the wrong side
 * of a title — there is no line to be under — so there is no bad end for red to
 * mark, and a team with no chance should be the quietest cell on the board
 * rather than the loudest.
 *
 * It used to be `polarity`, and that inverted the page. Both arms of a
 * two-sided scale are strongest at their ends, so 0.1% to win the title — true
 * of most of a classification, and news about none of it — came out as the
 * boldest cell on screen while a real 9% contender sat a shade off blank.
 *
 * Scaled against the column's own best, since a 14% title chance can be the
 * strongest number in its column while 14% to qualify is nearly hopeless. Then
 * square-rooted, because most of a classification lives under a tenth of the
 * leader and a straight ramp would flatten all of it into the same wash.
 */
export function magnitude(v: number, peak: number): Shade {
  return { hot: true, strength: Math.sqrt(clamp(v / Math.max(peak, 1e-9))) };
}

/**
 * A record as a share of games played, for the standings.
 *
 * Genuinely two-sided — .500 is a real midpoint that means the same thing
 * everywhere — so this one stays diverging. A level game is half a game won and
 * counts in the denominator; leaving ties out of it would let three of them
 * carry a 2-2 team past a 3-4 one.
 */
export function recordShade(w: number, l: number, t = 0): Shade & { played: number } {
  const played = w + l + t;
  const pct = played ? (w + t / 2) / played : 0.5;
  return { ...polarity(pct), played };
}
