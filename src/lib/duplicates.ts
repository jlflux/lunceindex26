/**
 * Finding fixtures that were stored more than once.
 *
 * Games are keyed on (t1, t2, week, type), so re-importing the same game the
 * same way updates one row and cannot duplicate. What that key cannot catch is
 * two sources disagreeing about which side is at home, or about which week a
 * game falls in — those produce genuinely different keys.
 *
 * Pure so the grouping can be tested without a database; deletion is
 * destructive enough to want that.
 */
import type { Game } from "./types";

export interface DuplicateGroup {
  kind: "reversed" | "repeated" | "collision";
  label: string;
  games: Game[];
}

export interface DuplicateReport {
  totalGames: number;
  /** Same pair, same week, opposite home/away. Effectively always a fault. */
  reversed: DuplicateGroup[];
  /** Same pair across different regular-season weeks. Needs judgement. */
  repeated: DuplicateGroup[];
  /** One school with two games in the same week, against different opponents. */
  collisions: DuplicateGroup[];
}

const pairKey = (g: Game) =>
  [g.t1, g.t2].sort((a, b) => a.localeCompare(b)).join(" ||| ");

export function findDuplicates(games: Game[]): DuplicateReport {
  const byPairWeek = new Map<string, Game[]>();
  const byPair = new Map<string, Game[]>();

  for (const g of games) {
    const pk = pairKey(g);
    const pwk = `${pk}|${g.week}|${g.type}`;
    byPairWeek.set(pwk, [...(byPairWeek.get(pwk) ?? []), g]);
    // Playoff rematches are normal, so only regular-season meetings are
    // compared across weeks.
    if (g.type === "regular") {
      byPair.set(pk, [...(byPair.get(pk) ?? []), g]);
    }
  }

  const reversed: DuplicateGroup[] = [...byPairWeek.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      kind: "reversed",
      label: `${group[0].t1} / ${group[0].t2} · week ${group[0].week}`,
      games: group,
    }));

  const alreadyReported = new Set(
    reversed.flatMap((r) => r.games.map((g) => g.id)),
  );

  const repeated: DuplicateGroup[] = [...byPair.values()]
    .filter((group) => {
      if (group.length < 2) return false;
      if (new Set(group.map((g) => g.week)).size < 2) return false;
      return group.some((g) => !alreadyReported.has(g.id));
    })
    .map((group) => ({
      kind: "repeated",
      label: `${group[0].t1} / ${group[0].t2} · weeks ${[
        ...new Set(group.map((g) => g.week)),
      ]
        .sort((a, b) => a - b)
        .join(", ")}`,
      games: group,
    }));

  return {
    totalGames: games.length,
    reversed,
    repeated,
    collisions: findCollisions(games, alreadyReported),
  };
}

/**
 * One school with two games in the same week.
 *
 * The opponents differ, so none of the pair-based checks above can see it —
 * and that is exactly the shape a mis-matched name leaves behind. When
 * "Prattville HS" resolved to Prattville Christian, Tuscaloosa County ended up
 * with a week-two result against Prattville Christian sitting beside the one
 * against Prattville, two rows that share no key at all.
 *
 * Nothing here is offered for automatic deletion. Which of the two is wrong
 * depends on which name was misread, and that is not knowable from the rows.
 */
function findCollisions(
  games: Game[],
  alreadyReported: Set<number | undefined>,
): DuplicateGroup[] {
  const byTeamWeek = new Map<string, Game[]>();
  for (const g of games) {
    // Rounds are keyed separately: a team plays once per playoff round, and
    // two rounds can share a week number.
    const slot = `${g.week}|${g.type}|${g.round ?? ""}`;
    for (const team of [g.t1, g.t2]) {
      const key = `${team}|${slot}`;
      byTeamWeek.set(key, [...(byTeamWeek.get(key) ?? []), g]);
    }
  }

  const out: DuplicateGroup[] = [];
  const seen = new Set<string>();
  for (const [key, group] of byTeamWeek) {
    if (group.length < 2) continue;
    // A swapped pair is the same fixture twice and is already reported above;
    // reporting it again here would double the noise for one fault.
    if (group.every((g) => alreadyReported.has(g.id))) continue;

    const team = key.slice(0, key.indexOf("|"));
    // One fixture reaches this map under both schools. Report it once.
    const identity = group
      .map((g) => g.id ?? `${g.t1}|${g.t2}`)
      .sort()
      .join(",");
    if (seen.has(identity)) continue;
    seen.add(identity);

    out.push({
      kind: "collision",
      label: `${team} · week ${group[0].week} · ${group.length} games`,
      games: group,
    });
  }
  return out;
}

/**
 * Which rows of a swapped pair are redundant.
 *
 * Keeps whichever copy carries a score — losing an entered result would be far
 * worse than keeping the wrong orientation — and otherwise the earliest row.
 */
export function redundantIds(group: DuplicateGroup): number[] {
  const scored = group.games.filter((g) => g.s1 !== null && g.s2 !== null);
  const pool = scored.length ? scored : group.games;
  const keep = pool.reduce((a, b) => ((a.id ?? 0) <= (b.id ?? 0) ? a : b));
  return group.games
    .filter((g) => g.id !== keep.id)
    .map((g) => g.id as number);
}
