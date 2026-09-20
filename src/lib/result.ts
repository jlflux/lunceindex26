/**
 * Who won — which turns out to be two questions.
 *
 * A forfeit splits a game in half. Maplesville beat Isabella 48-7 on the
 * field, then gave the game up weeks later over an eligibility violation. The
 * association's record says Maplesville lost. The football says they won by
 * forty-one, and no amount of paperwork makes them play like a team that lost.
 *
 * Every consumer in the codebase wants one of those two answers, and which one
 * is not a matter of taste:
 *
 *   - The Power Index measures how well a team plays, so it reads the field.
 *     That includes the win-rate term, which is part of the rating rather than
 *     a display column — feeding it the vacated result would drop a team down
 *     the board for a paperwork error, which is the whole thing being avoided.
 *   - Records, standings, region order, RPI and Strength of Record are all
 *     statements about a team's official record. They read the ruling. Region
 *     order decides who makes the playoffs, and the AHSAA counts the forfeit.
 *
 * Nothing here touches the scores. A forfeited game keeps its scoreline, which
 * is what lets the board show "Maplesville 48, Isabella 7" under a loss.
 */
import type { Game } from "./types";

/** Which side of a game row. `t1` is listed home, `t2` the visitor. */
export type Side = "t1" | "t2";

type Result = Pick<Game, "s1" | "s2" | "forfeit_by">;

export const other = (s: Side): Side => (s === "t1" ? "t2" : "t1");

/** Whether both scores are in. A forfeit does not change this either way. */
export function isPlayed(g: Pick<Game, "s1" | "s2">): boolean {
  return g.s1 !== null && g.s2 !== null;
}

/**
 * Who won on the field. Null when the game was not played, or was a tie.
 *
 * This is what the rating engines read.
 */
export function fieldWinner(g: Result): Side | null {
  if (g.s1 === null || g.s2 === null) return null;
  if (g.s1 === g.s2) return null;
  return g.s1 > g.s2 ? "t1" : "t2";
}

/**
 * Who is credited with the win in the standings.
 *
 * A forfeit hands it to the other side whatever the scoreboard said — and
 * whether or not the game was ever played, since a team that does not turn up
 * forfeits a game with no score at all.
 */
export function officialWinner(g: Result): Side | null {
  if (g.forfeit_by) return other(g.forfeit_by);
  return fieldWinner(g);
}

/** True when the ruling and the scoreboard disagree. */
export function isForfeit(g: Result): boolean {
  return Boolean(g.forfeit_by);
}

/**
 * The forfeit as seen from one side of the row.
 *
 * "gave" — this team forfeited, and a win on the field is a loss on paper.
 * "received" — the opponent forfeited, and this team is credited with a win.
 */
export function forfeitFor(g: Result, side: Side): "gave" | "received" | null {
  if (!g.forfeit_by) return null;
  return g.forfeit_by === side ? "gave" : "received";
}
