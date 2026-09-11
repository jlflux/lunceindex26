/**
 * The two hand-maintained boards: the Composite and the ASWA poll.
 *
 * Pure shapes and arithmetic — no I/O, so the rules can be tested without a
 * database. Loading lives in data.ts.
 */
import type { Classification } from "./types";

/** The outside polls averaged into the Composite, in display order. */
export const COMPOSITE_SOURCES = [
  { key: "maxpreps", label: "MaxPreps" },
  { key: "massey", label: "Massey" },
  { key: "hsratings", label: "HSRatings" },
  { key: "ahsfhs", label: "AHSFHS" },
] as const;

export type CompositeSource = (typeof COMPOSITE_SOURCES)[number]["key"];

/** One stored row: the four outside numbers for a team. Ours is never stored. */
export interface CompositeEntry {
  team: string;
  maxpreps: number | null;
  massey: number | null;
  hsratings: number | null;
  ahsfhs: number | null;
}

export interface CompositeRow extends CompositeEntry {
  slug: string | null;
  classification: Classification | null;
  /** Our own rank, read off the published board rather than stored. */
  ours: number | null;
  /** Mean of all five, or null when any one of them is missing. */
  average: number | null;
  /** How many of the five are present, so a thin row is visible as thin. */
  have: number;
  /** 1-based position among complete rows; 0 when it has no average. */
  rank: number;
}

/** How many teams make the board proper, the rest being the near misses. */
export const COMPOSITE_RANKED = 25;
/** Total shown, so the tail is the five that just missed. */
export const COMPOSITE_SHOWN = 30;

/**
 * Builds the Composite board.
 *
 * A team must carry a number in ALL FIVE polls to be ranked. That is the
 * editorial rule, not a convenience: a plain average over whatever happens to
 * be present lets a team nobody else rates ride one source's generosity to the
 * top of the board. Rows short of five still come back — they are what the
 * admin needs to see in order to finish them — but with a null average, and
 * they sort below everything complete.
 */
export function buildComposite(
  entries: CompositeEntry[],
  ourRank: Map<string, number>,
  meta?: Map<string, { slug: string; classification: Classification }>,
): CompositeRow[] {
  const rows: CompositeRow[] = entries.map((e) => {
    const ours = ourRank.get(e.team) ?? null;
    const nums = [ours, e.maxpreps, e.massey, e.hsratings, e.ahsfhs];
    const have = nums.filter((n): n is number => typeof n === "number").length;
    const complete = have === nums.length;
    const m = meta?.get(e.team);
    return {
      ...e,
      slug: m?.slug ?? null,
      classification: m?.classification ?? null,
      ours,
      have,
      average: complete
        ? (nums as number[]).reduce((a, b) => a + b, 0) / nums.length
        : null,
      rank: 0,
    };
  });

  rows.sort((a, b) => {
    if (a.average === null && b.average === null) {
      // Among incomplete rows, the ones closest to finished first.
      if (a.have !== b.have) return b.have - a.have;
      return a.team.localeCompare(b.team);
    }
    if (a.average === null) return 1;
    if (b.average === null) return -1;
    if (a.average !== b.average) return a.average - b.average;
    // A tie on the average goes to the team our own board likes better.
    return (a.ours ?? 9999) - (b.ours ?? 9999);
  });

  let n = 0;
  for (const r of rows) if (r.average !== null) r.rank = ++n;
  return rows;
}

// ---------------------------------------------------------------------------

export interface AswaEntry {
  classification: string;
  /** 1-10 in the poll proper; null for others receiving votes. */
  rank: number | null;
  team: string;
  wins: number;
  losses: number;
  first_votes: number;
  points: number;
}

export interface AswaClassBlock {
  classification: Classification;
  top: AswaEntry[];
  /** Teams that polled but missed the ten, most points first. */
  others: AswaEntry[];
}

/** How many teams the poll ranks in each classification. */
export const ASWA_TOP = 10;

/**
 * Groups poll rows into one block per classification.
 *
 * The top ten is ordered by its stated rank rather than by points: the rank is
 * what the release publishes, and a points column that disagrees with it is a
 * transcription slip worth seeing rather than silently re-sorting away.
 */
export function buildAswa(
  entries: AswaEntry[],
  order: Classification[],
): AswaClassBlock[] {
  const byClass = new Map<string, AswaEntry[]>();
  for (const e of entries) {
    const list = byClass.get(e.classification) ?? [];
    list.push(e);
    byClass.set(e.classification, list);
  }

  return order
    .filter((c) => byClass.has(c))
    .map((c) => {
      const all = byClass.get(c) as AswaEntry[];
      return {
        classification: c,
        top: all
          .filter((e) => typeof e.rank === "number")
          .sort((a, b) => (a.rank as number) - (b.rank as number)),
        others: all
          .filter((e) => e.rank === null)
          .sort((a, b) => b.points - a.points || a.team.localeCompare(b.team)),
      };
    });
}

/** "Homewood 12" style, the way a poll release prints the also-rans. */
export function othersLine(others: AswaEntry[]): string {
  return others
    .map((o) => (o.points ? `${o.team} ${o.points}` : o.team))
    .join(", ");
}
