/**
 * What the bracket renders, as opposed to what it resolves.
 *
 * One check here, and it exists because of a real fault: the team name in a
 * slot was a link to the team page with `stopPropagation` on it, which is
 * right for a reader and exactly wrong in the editor. The Projections tab
 * says "click a team to advance it", the name is the obvious thing to click,
 * and clicking it navigated to the team page and advanced nothing — while the
 * pick counter stayed at zero, so it looked as though the click did nothing.
 *
 * That cannot be caught by testing the resolver, which is why this renders the
 * component. Needs `jsx: react-jsx`, hence the tsconfig beside it.
 *
 * Usage: npx tsx --tsconfig scripts/tsconfig.render.json scripts/test-render.tsx
 */
import { renderToStaticMarkup } from "react-dom/server";
import BracketView from "../src/components/bracket/BracketView";
import { resolveBracket, seededRegions } from "../src/lib/bracket";
import { emptyBracketState, type BracketState } from "../src/lib/bracket-types";
import type { Classification, Game, RatingRow } from "../src/lib/types";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

let nextId = 1;
const g = (t1: string, t2: string, s1: number | null, s2: number | null): Game =>
  ({
    id: nextId++, t1, s1, t2, s2, week: 1, type: "regular", round: null,
    date: null, status: s1 === null ? "scheduled" : "final",
    neutral_site: false, forfeit_by: null,
  }) as Game;

const row = (name: string, region: number, rating: number): RatingRow =>
  ({
    name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    classification: "5A" as Classification, region, wins: 0, losses: 0, rating,
    massey: 0, sos: 0, o_eff: 0, d_eff: 0, ppg: 0, papg: 0, prior_blend: 0,
    rank: 0, class_rank: 0,
  }) as RatingRow;

const ratings: RatingRow[] = [];
for (let r = 1; r <= 2; r++)
  for (let p = 1; p <= 4; p++) ratings.push(row(`R${r}T${p}`, r, 100 - (r - 1) * 10 - p));

const games: Game[] = [];
for (let r = 1; r <= 2; r++)
  for (let a = 1; a <= 4; a++)
    for (let b = a + 1; b <= 4; b++) games.push(g(`R${r}T${a}`, `R${r}T${b}`, 21, 7));

const state: BracketState = emptyBracketState();
state.classes["5A"] = {
  alignment: [1, 2],
  slots: [
    { region: 1, place: 1 }, { region: 2, place: 4 },
    { region: 1, place: 2 }, { region: 2, place: 3 },
  ],
  results: {}, projected: {}, regions: {},
};

const seeded = seededRegions(ratings, games, undefined, state);
const bracket = resolveBracket(state, "5A", seeded, games, { projected: true })!;

console.log("\nThe slot in reader mode and in pick mode");
{
  const reader = renderToStaticMarkup(<BracketView bracket={bracket} />);
  const editor = renderToStaticMarkup(
    <BracketView bracket={bracket} onPick={() => {}} />,
  );

  check("a reader can click a team through to its profile",
    /href="\/team\/r1t1"/.test(reader));
  check("in pick mode the name is not a link, so the click reaches the row",
    !/href="\/team\//.test(editor),
    (editor.match(/href="[^"]*"/g) ?? []).slice(0, 3).join(" "));
  check("and the name is still shown", editor.includes("R1T1"));
  check("and still carries its tooltip", editor.includes("title=\"R1T1"));
}

console.log(
  failures === 0 ? "\nThe bracket renders.\n" : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
