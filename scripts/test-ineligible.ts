/**
 * Teams barred from championship play.
 *
 * A ban voids a team's region schedule for everyone. The banned side finishes
 * 0-0 in region; the teams that played it take an overall win or loss and no
 * region result; and for the tie-breaking procedure the game is not there at
 * all. The football still happened, so the rating reads every one of those
 * games exactly as before.
 *
 * Section 4 is the one that matters, for the same reason it is in the forfeit
 * tests: the rating must not move. Everything else here is about which
 * consumer reads which answer.
 *
 * Section 6 is not about bans. It covers the region win percentage, which had
 * the right formula sitting in a function nothing called while the live path
 * used a different one — so it is written to tell the two apart rather than to
 * agree with both, which is what the test it replaces did.
 *
 * Usage: npx tsx scripts/test-ineligible.ts
 */
import { computeRatings } from "../src/lib/engine";
import {
  countsForRegion,
  countsForTiebreak,
  isEligible,
  regionMetaOf,
  splitEligible,
} from "../src/lib/eligibility";
import { computeOdds } from "../src/lib/playoffs";
import {
  orderRegionStandings,
  regionRecords,
  tieDataFor,
} from "../src/lib/season";
import { orderRegion, standingPct } from "../src/lib/tiebreak";
import type { Record2 } from "../src/lib/season";
import {
  type Classification,
  type Game,
  type RatingRow,
  type Team,
} from "../src/lib/types";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

let nextId = 1;
const g = (
  t1: string,
  t2: string,
  s1: number | null,
  s2: number | null,
  week: number,
): Game => ({
  id: nextId++,
  t1,
  s1,
  t2,
  s2,
  week,
  type: "regular",
  round: null,
  date: null,
  status: s1 === null ? "scheduled" : "final",
  neutral_site: false,
  forfeit_by: null,
});

const team = (
  name: string,
  classification: Classification = "6A",
  region = 1,
  prior: number | null = 5,
  banned = false,
): Team => ({
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  classification,
  region,
  preseason_prior: prior,
  prior_source: null,
  postseason_ineligible: banned,
});

/** A rating row good enough for the season helpers. */
const row = (
  name: string,
  opts: Partial<RatingRow> & { banned?: boolean } = {},
): RatingRow =>
  ({
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    classification: "6A",
    region: 1,
    wins: 0,
    losses: 0,
    rating: 0,
    massey: 0,
    sos: 0,
    o_eff: 0,
    d_eff: 0,
    ppg: 0,
    papg: 0,
    prior_blend: 0,
    rank: 0,
    class_rank: 0,
    postseason_ineligible: opts.banned ?? false,
    ...opts,
  }) as RatingRow;

console.log("\n1. The predicate itself");
{
  const meta = regionMetaOf([
    row("Banned", { banned: true }),
    row("Mate"),
    row("Peer"),
    row("Other", { region: 2 }),
  ]);
  check(
    "two eligible teams in the same region is a region game",
    countsForRegion(g("Mate", "Peer", 1, 0, 1), meta) === true,
  );
  check(
    "the same pairing with one side banned is not",
    countsForRegion(g("Mate", "Banned", 1, 0, 1), meta) === false,
  );
  check(
    "a different region is not",
    countsForRegion(g("Mate", "Other", 1, 0, 1), meta) === false,
  );
  check(
    "an out-of-state name is not",
    countsForRegion(g("Mate", "Somewhere Else", 1, 0, 1), meta) === false,
  );
  check(
    "and neither is a playoff game between region mates",
    countsForRegion(
      { ...g("Mate", "Peer", 1, 0, 1), type: "playoff" },
      meta,
    ) === false,
  );
  check(
    "a game against a banned team is out of the tiebreak data entirely",
    countsForTiebreak(g("Mate", "Banned", 1, 0, 1), meta) === false,
  );
  check(
    "an ordinary non-region game stays in it — that category is one the rules read",
    countsForTiebreak(g("Mate", "Other", 1, 0, 1), meta) === true,
  );
  check("eligibility reads off the roster", !isEligible("Banned", meta) && isEligible("Mate", meta));

  const { eligible, banned } = splitEligible(
    [{ name: "Mate" }, { name: "Banned" }, { name: "Other" }],
    meta,
  );
  check(
    "the split keeps everyone",
    eligible.length === 2 && banned.length === 1 && banned[0].name === "Banned",
  );
}

console.log("\n2. The banned team is 0-0, and so is the game for its opponent");
{
  const rows = [
    row("Banned", { banned: true }),
    row("Alpha"),
    row("Beta"),
    row("Gamma"),
  ];
  const games = [
    g("Banned", "Alpha", 40, 0, 1), // banned team won on the field
    g("Beta", "Banned", 7, 35, 2), // and again
    g("Alpha", "Beta", 21, 14, 3), // an ordinary region game
    g("Alpha", "Gamma", 28, 7, 4),
  ];
  const reg = regionRecords(rows, games);

  check(
    "the banned team is 0-0 in region despite winning two region games",
    reg.get("Banned")?.wins === 0 && reg.get("Banned")?.losses === 0,
    JSON.stringify(reg.get("Banned")),
  );
  check(
    "its opponent takes no region loss from it",
    reg.get("Alpha")?.wins === 2 && reg.get("Alpha")?.losses === 0,
    JSON.stringify(reg.get("Alpha")),
  );
  check(
    "and neither does the other one",
    reg.get("Beta")?.wins === 0 && reg.get("Beta")?.losses === 1,
    JSON.stringify(reg.get("Beta")),
  );
}

console.log("\n3. The tiebreak data has no trace of them");
{
  const rows = [
    row("Banned", { banned: true, wins: 9, rating: 50 }),
    row("Alpha", { wins: 3 }),
    row("Beta", { wins: 3 }),
    // A non-region opponent, to prove the ordinary category still works.
    row("Outsider", { region: 5, wins: 2 }),
  ];
  const games = [
    g("Alpha", "Banned", 0, 30, 1),
    g("Beta", "Banned", 0, 30, 2),
    g("Alpha", "Outsider", 20, 0, 3),
  ];
  const data = tieDataFor(rows, games);

  const alpha = data.results.get("Alpha") ?? [];
  check(
    "the game against the banned team is not in the results at all",
    !alpha.some((x) => x.opponent === "Banned"),
    JSON.stringify(alpha),
  );
  check(
    "it is not smuggled in as a non-region game either",
    !alpha.some((x) => x.opponent === "Banned" && !x.required),
  );
  check(
    "a real non-region game is still there",
    alpha.some((x) => x.opponent === "Outsider" && !x.required),
  );
  check(
    "head-to-head does not record it",
    !data.beat.has("Banned|Alpha") && !data.met.has("Alpha|Banned"),
  );
  check(
    "a banned team's victories are worth nothing to factors (m) through (p)",
    data.victories.get("Banned") === 0,
    String(data.victories.get("Banned")),
  );
  check(
    "and it carries the 'cannot reach championship play' marker",
    data.classOrder.get("Banned") === null,
  );
}

console.log("\n4. The rating does not move. This is the point.");
{
  const teams = (banned: boolean) => [
    team("Banned", "6A", 1, 5, banned),
    team("Alpha"),
    team("Beta"),
    team("Gamma"),
  ];
  const games = [
    g("Banned", "Alpha", 40, 0, 1),
    g("Beta", "Banned", 7, 35, 2),
    g("Alpha", "Beta", 21, 14, 3),
    g("Alpha", "Gamma", 28, 7, 4),
    g("Beta", "Gamma", 17, 10, 5),
  ];

  const clean = computeRatings(teams(false), games);
  const barred = computeRatings(teams(true), games);

  const key = (r: { ratings: RatingRow[] }) =>
    r.ratings
      .map((t) => `${t.name}:${t.rating.toFixed(10)}:${t.wins}-${t.losses}`)
      .sort()
      .join("|");

  check(
    "every rating and every overall record is identical with the ban on",
    key(clean) === key(barred),
  );
  check(
    "including the banned team's own, which still beat two sides",
    barred.ratings.find((t) => t.name === "Banned")?.wins === 2,
  );
}

console.log("\n5. They take no playoff place, and nobody races them for one");
{
  // Two regions, because a bracket needs at least a pod to pair.
  const rows: RatingRow[] = [
    row("Banned", { banned: true, rating: 99 }), // best in its region
    row("Alpha", { rating: 10 }),
    row("Beta", { rating: 9 }),
    row("Gamma", { rating: 8 }),
    row("Pike", { region: 2, rating: 10 }),
    row("Quinn", { region: 2, rating: 9 }),
    row("Ridge", { region: 2, rating: 8 }),
    row("Stone", { region: 2, rating: 7 }),
  ];
  const games = [
    g("Banned", "Alpha", 40, 0, 1),
    g("Banned", "Beta", 40, 0, 2),
    g("Alpha", "Beta", 21, 14, 3),
    g("Alpha", "Gamma", 20, 7, 4),
    g("Beta", "Gamma", 20, 7, 5),
    g("Pike", "Quinn", 21, 14, 3),
    g("Pike", "Ridge", 20, 7, 4),
    g("Quinn", "Ridge", 20, 7, 5),
    g("Ridge", "Stone", 20, 7, 6),
  ];
  const reg = regionRecords(rows, games);
  const tie = tieDataFor(rows, games);
  const order = orderRegionStandings(rows, reg, tie);

  check(
    "the banned team sorts last, not into the .500 slot a 0-0 record buys",
    order[order.length - 1].name === "Banned",
    order.map((t) => t.name).join(","),
  );
  check("and everyone else keeps their order", order[0].name === "Alpha", order[0].name);

  const odds = computeOdds(rows, games, { trials: 200, seed: 7, qualifiers: 2 });
  const block = odds.classes[0];
  const banned = block.teams.find((t) => t.name === "Banned")!;
  check("it is flagged ineligible", banned.ineligible);
  check("not eliminated — it never was in the race", !banned.eliminated);
  check("no chance of a place", banned.playoff === 0);
  check("no chance of a seed", banned.seeds.every((v) => v === 0));
  check("0-0 in region on the board", banned.region_w === 0 && banned.region_l === 0);
  const r1 = block.teams.filter((t) => t.region === 1);
  check(
    "and it is placed below every eligible team in its region",
    r1[r1.length - 1].name === "Banned",
    r1.map((t) => t.name).join(","),
  );
  check(
    "clinching is proved against eligible rivals only",
    block.teams.filter((t) => t.clinched).every((t) => !t.ineligible),
  );
}

console.log("\n6. A tie is half a game won — in the formula that actually runs");
{
  // The two formulas: naive wins/(wins+losses), and half credit over every
  // game played. A 2-1-3 record is .667 under the first and .583 under the
  // second, which puts it either side of a 3-2 team. A case that agrees under
  // both proves nothing, which is how this went unnoticed.
  const tied: Record2 = { wins: 2, losses: 1, ties: 3 };
  const clean: Record2 = { wins: 3, losses: 2, ties: 0 };

  check(
    "2-1-3 is .583, not .667",
    Math.abs(standingPct(tied) - 3.5 / 6) < 1e-9,
    standingPct(tied).toFixed(4),
  );
  check("3-2 is .600", Math.abs(standingPct(clean) - 0.6) < 1e-9);

  const rec = (t: string): Record2 => (t === "Tied" ? tied : clean);
  const ctx = () => ({
    beat: () => false,
    metRequired: () => false,
    teamAtPlace: () => null,
    results: () => [],
    victories: () => 0,
    classOrder: () => 5,
    rating: (t: string) => (t === "Tied" ? 100 : 0),
  });
  const order = orderRegion(["Tied", "Clean"], rec, ctx);
  check(
    "so the 3-2 team is ordered above the 2-1-3 one, rating notwithstanding",
    order[0] === "Clean",
    order.join(),
  );

  check("no games played is neutral, not a loss", standingPct({ wins: 0, losses: 0, ties: 0 }) === 0.5);
}

console.log(
  failures === 0
    ? "\nBans behave.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
