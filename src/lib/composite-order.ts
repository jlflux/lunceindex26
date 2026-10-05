/**
 * The order the Composite editor shows its rows in.
 *
 * Here rather than in the component because it is a rule, not a rendering
 * detail: the editor's job is to show the board that is about to publish, and
 * the only way to be sure it does is to ask the same function the public page
 * asks. `buildComposite` already knows that an incomplete row sorts below
 * every complete one and that a tie on the average goes to whoever our own
 * board rates higher. Sorting by the average alone would agree with it most
 * weeks and disagree exactly where somebody would notice.
 */
import { buildComposite, type CompositeEntry } from "./rankings";

/** One row of the editor. Every cell is a string because every cell is typed. */
export interface EditorRow {
  team: string;
  maxpreps: string;
  massey: string;
  hsratings: string;
  ahsfhs: string;
}

export const blankRow = (): EditorRow => ({
  team: "",
  maxpreps: "",
  massey: "",
  hsratings: "",
  ahsfhs: "",
});

/** An editor row as the board rule wants it: numbers, or null for empty. */
export function toEntry(r: EditorRow): CompositeEntry {
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    team: r.team.trim(),
    maxpreps: num(r.maxpreps),
    massey: num(r.massey),
    hsratings: num(r.hsratings),
    ahsfhs: num(r.ahsfhs),
  };
}

/**
 * Rows in the order the board will publish them, blank rows last.
 *
 * The row count is preserved, so the empty rows that give the editor room to
 * reach thirty survive a sort instead of being tidied away.
 */
export function inBoardOrder(
  rows: EditorRow[],
  ourRank: Record<string, number>,
): EditorRow[] {
  const named = rows.filter((r) => r.team.trim());
  const blanks = rows.length - named.length;

  const at = new Map<string, number>();
  buildComposite(named.map(toEntry), new Map(Object.entries(ourRank))).forEach(
    (r, i) => {
      // A team entered twice is the editor's problem to flag on save, not
      // this function's to reorder around: the first position wins and the
      // sort stays stable, so the duplicate sits next to its twin.
      if (!at.has(r.team)) at.set(r.team, i);
    },
  );

  const sorted = [...named].sort(
    (a, b) =>
      (at.get(a.team.trim()) ?? Number.MAX_SAFE_INTEGER) -
      (at.get(b.team.trim()) ?? Number.MAX_SAFE_INTEGER),
  );
  return [...sorted, ...Array.from({ length: blanks }, blankRow)];
}

/**
 * Board position for each row index, for the number down the editor's left.
 *
 * Empty for a row that cannot be ranked, which is what the board does too.
 */
export function boardPositions(
  rows: EditorRow[],
  ourRank: Record<string, number>,
): Map<number, number> {
  const ranked = buildComposite(
    rows.filter((r) => r.team.trim()).map(toEntry),
    new Map(Object.entries(ourRank)),
  );
  const byTeam = new Map(
    ranked.filter((r) => r.rank > 0).map((r) => [r.team, r.rank]),
  );
  const out = new Map<number, number>();
  rows.forEach((r, i) => {
    const pos = byTeam.get(r.team.trim());
    if (pos) out.set(i, pos);
  });
  return out;
}
