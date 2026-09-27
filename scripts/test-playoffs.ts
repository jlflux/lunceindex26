/**
 * Checks the playoff odds.
 *
 * Percentages are the easiest thing in this codebase to get plausibly wrong:
 * they always look like percentages. So most of what follows is arithmetic
 * that has to hold no matter what the football does — probabilities summing
 * where they must, a team that cannot be caught reading 100%, a team that
 * cannot catch up reading 0 — plus the two claims strong enough to need
 * proofs rather than samples, clinched and eliminated.
 *
 * Usage: npx tsx scripts/test-playoffs.ts
 */
import {
  computeOdds,
  podBracket,
  podSize,
  podsFor,
  qualifiersFor,
  roundNames,
  seedSlots,
} from "../src/lib/playoffs";
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
const game = (
  t1: string,
  t2: string,
  s1: number | null,
  s2: number | null,
  week = 1,
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

const row = (
  name: string,
  classification: Classification,
  region: number,
  rating: number,
): RatingRow => ({
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  classification,
  region,
  wins: 0,
  losses: 0,
  rating,
  massey: rating,
  sos: 0,
  o_eff: 0,
  d_eff: 0,
  ppg: 21,
  papg: 14,
  prior_blend: 0,
  rank: 0,
  class_rank: 0,
});

/** A classification of `regions` regions with `per` teams in each. */
function field(cls: Classification, regions: number, per: number): RatingRow[] {
  const out: RatingRow[] = [];
  for (let r = 1; r <= regions; r++) {
    for (let i = 0; i < per; i++) {
      out.push(row(`${cls}-R${r}-T${i + 1}`, cls, r, 20 - i * 2));
    }
  }
  return out;
}

/** Every region game in a round robin, unplayed. */
function roundRobin(teams: RatingRow[]): Game[] {
  const out: Game[] = [];
  const byRegion = new Map<number, RatingRow[]>();
  for (const t of teams) {
    const l = byRegion.get(t.region) ?? [];
    l.push(t);
    byRegion.set(t.region, l);
  }
  for (const list of byRegion.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        out.push(game(list[i].name, list[j].name, null, null));
      }
    }
  }
  return out;
}

console.log("\n1. The bracket, as the 2025 season played it");
{
  check("eight regions pair 1-2, 3-4, 5-6, 7-8",
    JSON.stringify(podsFor(8)) === JSON.stringify([[1,2],[3,4],[5,6],[7,8]]),
    JSON.stringify(podsFor(8)));
  check("four regions cross, 1-4 and 2-3",
    JSON.stringify(podsFor(4)) === JSON.stringify([[1,4],[2,3]]),
    JSON.stringify(podsFor(4)));
  check("two regions are a single pod",
    JSON.stringify(podsFor(2)) === JSON.stringify([[1,2]]));
}

console.log("\n1b. The standard bracket reproduces the AHSAA pairing");
{
  check("four slots order 1,4,2,3", seedSlots(4).join() === "1,4,2,3", seedSlots(4).join());
  check("eight slots order 1,8,4,5,2,7,3,6",
    seedSlots(8).join() === "1,8,4,5,2,7,3,6", seedSlots(8).join());

  // Pod seeds alternate the two regions, so with four from each the ordinary
  // bracket lays out A1-B4, B2-A3, B1-A4, A2-B3 — which is what every
  // eight-region class actually played in 2025. It was not built to match.
  const seeded = [
    ["A1", "A2", "A3", "A4"],
    ["B1", "B2", "B3", "B4"],
  ];
  const flat = podBracket(seeded, [1, 2], 4);
  const games = [];
  for (let i = 0; i < flat.length; i += 2) games.push(`${flat[i]}v${flat[i + 1]}`);
  check(
    "four qualifiers give the 2025 pairing",
    games.join(" ") === "A1vB4 B2vA3 B1vA4 A2vB3",
    games.join(" "),
  );

  // 6A sends six, so a pod of twelve sits in a bracket of sixteen and the
  // four empty slots land against the four best seeds — the two region
  // champions and the two runners-up.
  check("six qualifiers need a bracket of sixteen", podSize(6) === 16, `${podSize(6)}`);
  const six = [
    ["A1", "A2", "A3", "A4", "A5", "A6"],
    ["B1", "B2", "B3", "B4", "B5", "B6"],
  ];
  const f6 = podBracket(six, [1, 2], 6);
  const byes = [];
  for (let i = 0; i < f6.length; i += 2) {
    if (f6[i] && !f6[i + 1]) byes.push(f6[i]);
    if (!f6[i] && f6[i + 1]) byes.push(f6[i + 1]);
  }
  check(
    "the champions and runners-up sit out the first round",
    byes.sort().join() === "A1,A2,B1,B2",
    byes.join(),
  );
  check("and everybody else plays", f6.filter(Boolean).length === 12);
  check("eight qualifiers need no byes", podSize(8) === 16 &&
    podBracket([["A1","A2","A3","A4","A5","A6","A7","A8"],
                ["B1","B2","B3","B4","B5","B6","B7","B8"]], [1, 2], 8)
      .every((x) => x !== ""));
}

console.log("\n1c. Each classification sends what it is told to send");
{
  check("6A sends six", qualifiersFor("6A") === 6);
  check("1A through 5A send four",
    ["1A","2A","3A","4A","5A"].every((c) => qualifiersFor(c) === 4));
  check("A sends four", qualifiersFor("A") === 4);
  check("AA sends all eight", qualifiersFor("AA") === 8);
  check("but never more than a region holds", qualifiersFor("AA", 5) === 5);
}

console.log("\n2. Rounds are named from the final backwards");
{
  check("five rounds", roundNames(5).join(", ") ===
    "First Round, Second Round, Quarterfinals, Semifinals, Championship",
    roundNames(5).join(", "));
  // A four-region class plays one round fewer; its last game is still a final.
  check("four rounds end in a championship, not a semifinal",
    roundNames(4).at(-1) === "Championship" && roundNames(4)[0] === "Second Round",
    roundNames(4).join(", "));
  check("three rounds", roundNames(3).join(", ") ===
    "Quarterfinals, Semifinals, Championship", roundNames(3).join(", "));
}

console.log("\n3. Probabilities behave like probabilities");
{
  const teams = field("1A", 8, 6);
  const r = computeOdds(teams, roundRobin(teams), { trials: 400, seed: 7 });
  const c = r.classes.find((x) => x.classification === "1A")!;

  check("every team is reported", c.teams.length === 48, `${c.teams.length}`);
  check("five rounds for eight regions", c.roundNames.length === 5);
  check(
    "no probability escapes 0-1",
    c.teams.every((t) =>
      [t.playoff, ...t.seeds, ...t.rounds].every((p) => p >= 0 && p <= 1),
    ),
  );
  check(
    "the four seeds of a region sum to one per team-slot",
    Math.abs(c.teams.reduce((a, t) => a + t.seeds.reduce((x, y) => x + y, 0), 0) -
      8 * qualifiersFor("1A")) < 1e-9,
  );
  check(
    "making the playoffs is exactly holding one of the four seeds",
    c.teams.every(
      (t) => Math.abs(t.playoff - t.seeds.reduce((a, b) => a + b, 0)) < 1e-9,
    ),
  );
  check(
    "each round is won by exactly as many teams as there are games",
    c.roundNames.every((_, i) => {
      const total = c.teams.reduce((a, t) => a + t.rounds[i], 0);
      return Math.abs(total - 32 / Math.pow(2, i + 1)) < 1e-9;
    }),
    c.roundNames.map((_, i) => c.teams.reduce((a, t) => a + t.rounds[i], 0).toFixed(2)).join(" "),
  );
  check(
    "exactly one champion per simulated season",
    Math.abs(c.teams.reduce((a, t) => a + (t.rounds.at(-1) ?? 0), 0) - 1) < 1e-9,
  );
  check(
    "a team never wins a later round more often than an earlier one",
    c.teams.every((t) =>
      t.rounds.every((p, i) => i === 0 || p <= t.rounds[i - 1] + 1e-12),
    ),
  );
  check(
    "and never wins a round more often than it makes the playoffs",
    c.teams.every((t) => t.rounds[0] <= t.playoff + 1e-12),
  );
}

console.log("\n3b. A class that seeds more than four");
{
  // 6A sends six from each region, so there are six seeds to account for and
  // six columns to fill. A tally sized to four leaves the last two empty,
  // which looks like "nobody ever finishes fifth" rather than like a bug.
  const teams = field("6A", 4, 8);
  const r = computeOdds(teams, roundRobin(teams), { trials: 400, seed: 21 });
  const c = r.classes.find((x) => x.classification === "6A")!;
  check("six qualifiers", c.qualifiers === 6, `${c.qualifiers}`);
  check("six seed columns", c.teams[0].seeds.length === 6, `${c.teams[0].seeds.length}`);
  check(
    "every seed is actually finished on by somebody",
    c.teams[0].seeds.every((_, i) => c.teams.some((t) => t.seeds[i] > 0)),
    c.teams[0].seeds.map((_, i) => c.teams.reduce((a, t) => a + t.seeds[i], 0).toFixed(2)).join(" "),
  );
  check(
    "each seed is held by exactly one team per region per season",
    c.teams[0].seeds.every((_, i) =>
      Math.abs(c.teams.reduce((a, t) => a + t.seeds[i], 0) - 4) < 1e-9,
    ),
  );
  check(
    "making the playoffs is still exactly holding one of the seeds",
    c.teams.every(
      (t) => Math.abs(t.playoff - t.seeds.reduce((a, b) => a + b, 0)) < 1e-9,
    ),
  );
  check("and 24 qualifiers still make a five-round bracket", c.roundNames.length === 5);
}

console.log("\n4. Better teams do better");
{
  const teams = field("3A", 8, 6);
  const r = computeOdds(teams, roundRobin(teams), { trials: 600, seed: 11 });
  const c = r.classes.find((x) => x.classification === "3A")!;
  const best = c.teams.find((t) => t.name === "3A-R1-T1")!;
  const worst = c.teams.find((t) => t.name === "3A-R1-T6")!;
  check(
    "the strongest team in a region is likelier to reach the playoffs",
    best.playoff > worst.playoff,
    `${best.playoff} vs ${worst.playoff}`,
  );
  check(
    "and likelier to win the region",
    best.seeds[0] > worst.seeds[0],
    `${best.seeds[0]} vs ${worst.seeds[0]}`,
  );
  // Every region is built identically, so the eight region leaders are
  // equally strong and which of them wins most is luck. Give one of them a
  // decisive edge and it should become the likeliest champion outright.
  const loaded = teams.map((t) =>
    t.name === "3A-R1-T1" ? { ...t, rating: 60, massey: 60 } : t,
  );
  const r2 = computeOdds(loaded, roundRobin(loaded), { trials: 600, seed: 11 });
  const c2 = r2.classes.find((x) => x.classification === "3A")!;
  const champ = c2.teams.reduce((a, b) =>
    (a.rounds.at(-1) ?? 0) >= (b.rounds.at(-1) ?? 0) ? a : b,
  );
  check(
    "a clearly dominant team is the likeliest champion",
    champ.name === "3A-R1-T1",
    `${champ.name} at ${(champ.rounds.at(-1)! * 100).toFixed(1)}%`,
  );
  check(
    "and wins the title far more often than an average side",
    champ.rounds.at(-1)! > 0.25,
    `${(champ.rounds.at(-1)! * 100).toFixed(1)}%`,
  );
}

console.log("\n5. A region small enough that everyone qualifies");
{
  // Four teams, four places. Nobody can miss, whatever happens on the field.
  const teams = field("AA", 2, 4);
  const r = computeOdds(teams, roundRobin(teams), { trials: 200, seed: 3 });
  const c = r.classes.find((x) => x.classification === "AA")!;
  check("three rounds for eight qualifiers", c.roundNames.length === 3, `${c.roundNames.length}`);
  check("everyone makes it", c.teams.every((t) => t.playoff === 1));
  check("and everyone is clinched, by proof not by sampling",
    c.teams.every((t) => t.clinched));
  check("nobody is eliminated", c.teams.every((t) => !t.eliminated));
}

console.log("\n6. Clinching and elimination are proved, not sampled");
{
  // Region 1: six teams, five region games each. A and B have won every game;
  // E and F have lost every one and have nothing left to play.
  const teams = [
    row("A", "5A", 1, 30), row("B", "5A", 1, 28), row("C", "5A", 1, 20),
    row("D", "5A", 1, 18), row("E", "5A", 1, 6), row("F", "5A", 1, 4),
    ...field("5A", 8, 4).filter((t) => t.region !== 1),
  ];
  const played: Game[] = [];
  const names = ["A", "B", "C", "D", "E", "F"];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      // Seeded by strength: the earlier name always wins.
      played.push(game(names[i], names[j], 28, 7));
    }
  }
  const r = computeOdds(teams, played, { trials: 100, seed: 5 });
  const c = r.classes.find((x) => x.classification === "5A")!;
  const by = new Map(c.teams.map((t) => [t.name, t]));

  check("a team that swept the region is clinched", by.get("A")!.clinched);
  check("and reads 100%", by.get("A")!.playoff === 1);
  check("the fourth-placed team is clinched too", by.get("D")!.clinched);
  check("the fifth is eliminated", by.get("E")!.eliminated, JSON.stringify(by.get("E")));
  check("and reads 0%", by.get("E")!.playoff === 0);
  check("an eliminated team is never also clinched",
    c.teams.every((t) => !(t.clinched && t.eliminated)));
  check(
    "no team is flagged against its own odds",
    c.teams.every((t) =>
      (!t.clinched || t.playoff === 1) && (!t.eliminated || t.playoff === 0),
    ),
  );
}

console.log("\n7. A season with nothing left to play is already decided");
{
  const teams = field("2A", 8, 4);
  const played = roundRobin(teams).map((g) => ({ ...g, s1: 28, s2: 7, status: "final" }));
  const r = computeOdds(teams, played, { trials: 50, seed: 9 });
  const c = r.classes.find((x) => x.classification === "2A")!;
  check("nothing is left to simulate", r.remaining === 0);
  check(
    "every region's four qualifiers are certain",
    c.teams.filter((t) => t.playoff === 1).length === 32,
    `${c.teams.filter((t) => t.playoff === 1).length}`,
  );
  check(
    "and everyone else is out",
    c.teams.every((t) => t.playoff === 1 || t.playoff === 0),
  );
  check("the title is still open", (c.teams[0].rounds.at(-1) ?? 0) < 1);
}

console.log("\n8. The same data gives the same page twice");
{
  const teams = field("4A", 8, 5);
  const g = roundRobin(teams);
  const a = computeOdds(teams, g, { trials: 300, seed: 42 });
  const b = computeOdds(teams, g, { trials: 300, seed: 42 });
  check(
    "identical output for an identical seed",
    JSON.stringify(a.classes) === JSON.stringify(b.classes),
  );
  const d = computeOdds(teams, g, { trials: 300, seed: 43 });
  check(
    "and different output for a different one",
    JSON.stringify(a.classes) !== JSON.stringify(d.classes),
  );
}

console.log("\n9. Forfeits count in the region table the odds are built on");
{
  const teams = [
    row("P", "1A", 1, 30), row("Q", "1A", 1, 10),
    ...field("1A", 8, 4).filter((t) => t.region !== 1),
  ];
  const straight = [game("P", "Q", 48, 7)];
  const vacated = [{ ...game("P", "Q", 48, 7), forfeit_by: "t1" as const }];
  const a = computeOdds(teams, straight, { trials: 50, seed: 2 });
  const b = computeOdds(teams, vacated, { trials: 50, seed: 2 });
  const pa = a.classes[0].teams.find((t) => t.name === "P")!;
  const pb = b.classes[0].teams.find((t) => t.name === "P")!;
  check("the win counts normally", pa.region_w === 1 && pa.region_l === 0);
  check("the forfeit counts as a region loss", pb.region_w === 0 && pb.region_l === 1,
    `${pb.region_w}-${pb.region_l}`);
  const qb = b.classes[0].teams.find((t) => t.name === "Q")!;
  check("and as a region win for the opponent", qb.region_w === 1);
}

console.log(
  failures === 0
    ? "\nThe odds behave.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
