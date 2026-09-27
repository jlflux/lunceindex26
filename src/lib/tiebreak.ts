/**
 * Ordering a region when teams finish level.
 *
 * This exists because there were two of these. The standings page compared
 * records and then went straight to the rating; the odds simulation compared
 * records, then head-to-head, then the rating. Two pages that both claim to
 * show who is in the playoff places could therefore disagree about it, which
 * is the worst possible way for a tie to be broken.
 *
 * It is also written around groups rather than pairs, which head-to-head
 * requires. Beating one team and losing to another is ordinary, so "did A beat
 * B" is not transitive, and feeding it to a comparator gives an answer that
 * depends on what order the array happened to be in. The AHSAA's own question
 * is not "did A beat B" but "how did these three do against each other", and
 * that is a property of the group.
 *
 * THE CHAIN IS INCOMPLETE. The association publishes a long list of
 * tiebreakers, lettered down to a coin flip. What is implemented here is
 * head-to-head, which is the first of them, and a deterministic stand-in for
 * the last. The rules in between are deliberately absent rather than guessed
 * at: a tiebreaker applied in the wrong position is worse than one that is
 * missing, because it silently produces a defensible-looking wrong order.
 * Adding them is a matter of writing more entries in TIE_RULES — the machinery
 * around them already handles partitioning, recursion and reporting.
 */
import type { Record2 } from "./season";

export interface TieContext {
  /** True when `a` beat `b` in a region game. */
  beat(a: string, b: string): boolean;
  /** Final separator, standing in for the coin flip the association uses. */
  rating(team: string): number;
}

export interface TieRule {
  key: string;
  /** Shown to a reader when a place was decided by this rule. */
  label: string;
  /** Higher is better. Every team in `tied` is scored against that group. */
  score(team: string, tied: string[], ctx: TieContext): number;
}

/**
 * The rules, in the order they are applied.
 *
 * Only the one the association applies first. See the note at the top of the
 * file about why the rest are not guessed at.
 */
export const TIE_RULES: TieRule[] = [
  {
    key: "h2h",
    label: "head-to-head among the tied teams",
    score(team, tied, ctx) {
      let w = 0;
      let n = 0;
      for (const other of tied) {
        if (other === team) continue;
        if (ctx.beat(team, other)) {
          w++;
          n++;
        } else if (ctx.beat(other, team)) {
          n++;
        }
      }
      // A team that has not played the others cannot be separated by this.
      return n ? w / n : -1;
    },
  },
];

/**
 * Region standing before any tiebreaker: win percentage, then wins.
 *
 * Percentage first is how a standings table reads — 1-0 leads 3-1 — with the
 * count breaking ties so 2-0 sits above 1-0. A team that has not opened region
 * play counts as neutral rather than as a loss, so mid-season it is not buried
 * beneath teams that have started and lost.
 */
function standingKey(r: Record2): [number, number] {
  const n = r.wins + r.losses;
  return [n ? r.wins / n : 0.5, r.wins];
}

/**
 * Orders one region, best first.
 *
 * Teams are grouped by their region record and each group is resolved by the
 * chain. When a rule splits a group, the pieces start the chain again from the
 * top rather than carrying on where it left off — head-to-head among two teams
 * can say something different from head-to-head among four, and the smaller
 * question is the one the association asks once the group has shrunk. That
 * cannot loop: a split always produces pieces smaller than what went in, and a
 * rule that fails to split moves to the next rule.
 */
export function orderRegion(
  teams: string[],
  regionRecord: (team: string) => Record2,
  ctx: TieContext,
): string[] {
  if (teams.length < 2) return [...teams];

  // Hot path. This runs once per region per simulated season — half a million
  // times on a full slate — so it works on indices into plain arrays rather
  // than on maps keyed by name, which is where an earlier version spent most
  // of the simulation's time.
  const n = teams.length;
  const pct = new Float64Array(n);
  const wins = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = regionRecord(teams[i]);
    const played = r.wins + r.losses;
    pct[i] = played ? r.wins / played : 0.5;
    wins[i] = r.wins;
  }

  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => pct[b] - pct[a] || wins[b] - wins[a]);

  let tied = false;
  for (let i = 1; i < n && !tied; i++) {
    const a = order[i];
    const b = order[i - 1];
    tied = pct[a] === pct[b] && wins[a] === wins[b];
  }
  // Nothing level: the record settled it and no tiebreaker is needed.
  if (!tied) return order.map((i) => teams[i]);

  const out: string[] = [];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (
      j < n &&
      pct[order[j]] === pct[order[i]] &&
      wins[order[j]] === wins[order[i]]
    ) {
      j++;
    }
    if (j - i === 1) out.push(teams[order[i]]);
    else {
      out.push(
        ...resolve(
          order.slice(i, j).map((k) => teams[k]),
          ctx,
          0,
        ),
      );
    }
    i = j;
  }
  return out;
}

function resolve(group: string[], ctx: TieContext, from: number): string[] {
  if (group.length < 2) return group;
  if (from >= TIE_RULES.length) {
    // Everything the association would settle with a coin flip, settled the
    // same way every time instead. A page that reshuffles a tie on each
    // publish is worse than one that picks a side and stays there.
    return [...group].sort(
      (a, b) => ctx.rating(b) - ctx.rating(a) || a.localeCompare(b),
    );
  }

  const rule = TIE_RULES[from];
  const scored = group.map((t) => ({ t, s: rule.score(t, group, ctx) }));
  const distinct = new Set(scored.map((x) => x.s));
  if (distinct.size < 2) return resolve(group, ctx, from + 1);

  const parts: string[][] = [];
  for (const s of [...distinct].sort((a, b) => b - a)) {
    parts.push(scored.filter((x) => x.s === s).map((x) => x.t));
  }
  return parts.flatMap((p) => resolve(p, ctx, 0));
}

/**
 * Which rule, if any, decided a team's place ahead of the team behind it.
 *
 * Used to say so on the page. Null when the two are not actually level on
 * record, which is the ordinary case.
 */
export function decidedBy(
  a: string,
  b: string,
  regionRecord: (team: string) => Record2,
  ctx: TieContext,
): string | null {
  const ka = standingKey(regionRecord(a));
  const kb = standingKey(regionRecord(b));
  if (ka[0] !== kb[0] || ka[1] !== kb[1]) return null;
  for (const rule of TIE_RULES) {
    const sa = rule.score(a, [a, b], ctx);
    const sb = rule.score(b, [a, b], ctx);
    if (sa !== sb) return rule.label;
  }
  return "the Index rating, in place of a coin flip";
}
