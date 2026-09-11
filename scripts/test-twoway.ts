/**
 * Invariant checks for the two-way engine.
 *
 * The season-level evidence lives in validate-2025-season.ts. These are the
 * properties that hold on any data at all — the ones that, when broken,
 * produce a board that looks fine and is wrong.
 */
import { applyCeiling, computeTwoWay, tierOf } from "../src/lib/engine-twoway";
import { computeBoard, modelOf } from "../src/lib/board";
import {
  TWOWAY_DEFAULTS,
  type Game,
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

const team = (
  name: string,
  classification: Team["classification"] = "5A",
  prior: number | null = null,
): Team => ({
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  classification,
  region: 1,
  preseason_prior: prior,
  prior_source: null,
});

const game = (
  t1: string,
  s1: number | null,
  t2: string,
  s2: number | null,
  week = 1,
  extra: Partial<Game> = {},
): Game => ({
  t1, s1, t2, s2, week, type: "regular", round: null, date: null,
  status: "final", ...extra,
});

const solve = (t: Team[], g: Game[], c: Partial<typeof TWOWAY_DEFAULTS> = {}) =>
  computeTwoWay(t, g, { ...TWOWAY_DEFAULTS, ...c });

console.log("\n1. Points can never come out negative");
{
  // The reason this engine is multiplicative. An additive version of the same
  // model put the best defence in the state at −13 points a game, because
  // nothing in it knows a score has a floor.
  const teams = [
    team("Monster", "6A", 40),
    team("Awful", "1A", -25),
    team("Mid", "3A", 0),
  ];
  const res = solve(teams, [
    game("Monster", 84, "Awful", 0, 0),
    game("Monster", 77, "Mid", 0, 1),
    game("Mid", 56, "Awful", 0, 2),
  ]);
  const worst = Math.min(...res.ratings.map((r) => r.adj_d as number));
  const leanest = Math.min(...res.ratings.map((r) => r.adj_o as number));
  check("no negative adjusted defence", worst > 0, `min ${worst.toFixed(2)}`);
  check("no negative adjusted offence", leanest > 0, `min ${leanest.toFixed(2)}`);
  check(
    "and the rating is still the difference of the two",
    res.ratings.every(
      (r) => Math.abs(r.rating - ((r.adj_o as number) - (r.adj_d as number))) < 1e-9,
    ),
  );
}

console.log("\n2. A shut-out does not blow up the solve");
{
  // log(0) is the obvious way to lose a season. The prior pseudo-games in the
  // numerator are what keep it finite.
  const teams = [team("Zero"), team("Other")];
  const res = solve(teams, [game("Zero", 0, "Other", 63, 1)]);
  check(
    "every figure is finite",
    res.ratings.every(
      (r) => Number.isFinite(r.rating) && Number.isFinite(r.adj_o as number),
    ),
  );
  const z = res.ratings.find((r) => r.name === "Zero")!;
  check("the shut-out team scores above zero, not at it", (z.adj_o as number) > 0);
}

console.log("\n3. The offence/defence split is shrunk harder than the level");
{
  // One freak offensive night must not decide a season. Same net margin, very
  // different shape: a 56-42 win and a 21-7 win are both +14.
  const teams = [team("Shootout"), team("Grind"), team("Foil"), team("Foil2")];
  const games = [
    game("Shootout", 56, "Foil", 42, 1),
    game("Grind", 21, "Foil2", 7, 1),
  ];
  const loose = solve(teams, games, { split_lambda: 0 });
  const tight = solve(teams, games, { split_lambda: 30 });
  const gap = (r: ReturnType<typeof solve>) => {
    const a = r.ratings.find((x) => x.name === "Shootout")!;
    const b = r.ratings.find((x) => x.name === "Grind")!;
    return Math.abs((a.adj_o as number) - (b.adj_o as number));
  };
  check(
    "hard shrinkage pulls the two offences together",
    gap(tight) < gap(loose),
    `${gap(tight).toFixed(2)} vs ${gap(loose).toFixed(2)}`,
  );
  const net = (r: ReturnType<typeof solve>, n: string) =>
    r.ratings.find((x) => x.name === n)!.rating;
  check(
    "while both teams keep the same net edge either way",
    Math.abs(net(tight, "Shootout") - net(tight, "Grind")) < 3 &&
      Math.abs(net(loose, "Shootout") - net(loose, "Grind")) < 3,
  );
}

console.log("\n4. A neutral game carries no home advantage");
{
  // The 2025 export is winner-first, not home-first. Read as home-vs-away it
  // would teach the model a ~24-point home edge out of nothing.
  const teams = [team("A"), team("B")];
  const sited = solve(teams, [game("A", 28, "B", 21, 1)], { hfa: 8 });
  const neutral = solve(teams, [
    game("A", 28, "B", 21, 1, { neutral_site: true }),
  ], { hfa: 8 });
  const a = (r: ReturnType<typeof solve>) =>
    r.ratings.find((x) => x.name === "A")!.rating;
  check(
    "the home side is credited less than the same result at a neutral site",
    a(sited) < a(neutral),
    `${a(sited).toFixed(2)} vs ${a(neutral).toFixed(2)}`,
  );
}

console.log("\n5. The class baseline only applies without a carry-over");
{
  // A carry-over rating already reflects classification; adding the baseline
  // on top would charge a small school for its class twice.
  const withPrior = [team("P", "1A", 20), team("Q", "6A", 20)];
  const res = solve(withPrior, [game("P", 21, "Q", 20, 1)], { class_spread: 90 });
  const p = res.ratings.find((r) => r.name === "P")!.rating;
  const q = res.ratings.find((r) => r.name === "Q")!.rating;
  check(
    "equal priors in different classes start level",
    Math.abs(p - q) < 6,
    `1A ${p.toFixed(2)} vs 6A ${q.toFixed(2)}`,
  );

  const noPrior = [team("R", "1A"), team("S", "6A")];
  const res2 = solve(noPrior, [game("R", 21, "S", 20, 1)], { class_spread: 90 });
  const r2 = res2.ratings.find((r) => r.name === "R")!.rating;
  const s2 = res2.ratings.find((r) => r.name === "S")!.rating;
  check(
    "without priors the classification separates them",
    s2 > r2 + 10,
    `1A ${r2.toFixed(2)} vs 6A ${s2.toFixed(2)}`,
  );
}

console.log("\n6. Tiers place the private bracket where it plays");
{
  check("AA sits between 4A and 5A", tierOf("AA") > tierOf("4A") && tierOf("AA") < tierOf("5A"));
  check("A sits between 2A and 3A", tierOf("A") > tierOf("2A") && tierOf("A") < tierOf("3A"));
  check("2025's 7A is still read", tierOf("7A") === 7);
}

console.log("\n7. Strength of Record reads the schedule, not the scoreboard");
{
  // Two 1-0 teams; one beat a good side narrowly, the other beat a bad side
  // by 50. The résumé figure must prefer the win that was hard to get.
  const teams = [team("Narrow"), team("Blowout"), team("Good", "6A", 35), team("Bad", "1A", -25)];
  const res = solve(teams, [
    game("Narrow", 14, "Good", 13, 1),
    game("Blowout", 56, "Bad", 6, 1),
  ]);
  const n = res.ratings.find((r) => r.name === "Narrow")!.sor as number;
  const b = res.ratings.find((r) => r.name === "Blowout")!.sor as number;
  check("beating a good team narrowly outranks thrashing a bad one", n > b, `${n.toFixed(3)} vs ${b.toFixed(3)}`);
}

console.log("\n8. The dispatcher honours the model field");
{
  const teams = [team("A", "6A", 20), team("B", "5A", 10)];
  const g = [game("A", 35, "B", 14, 1)];
  check("absent model means classic", modelOf({}) === "classic");
  check("an explicit model is respected", modelOf({ model: "twoway" }) === "twoway");
  const classic = computeBoard(teams, g, {});
  const two = computeBoard(teams, g, { model: "twoway" });
  check("classic rows carry no adjusted split", classic.ratings[0].adj_o === undefined);
  check("two-way rows do", typeof two.ratings[0].adj_o === "number");
  check(
    "both rank the winner first",
    classic.ratings[0].name === "A" && two.ratings[0].name === "A",
  );
}

console.log("\n9. Scoring has a ceiling");
{
  const { ceiling_from: F, ceiling: C } = TWOWAY_DEFAULTS;
  check("the defaults set a real ceiling", C > F && C < 200, `${F}..${C}`);
  check("below the bend nothing is touched", applyCeiling(F - 5, F, C) === F - 5);
  check("at the bend nothing is touched", applyCeiling(F, F, C) === F);
  check(
    "above it, figures are pulled down",
    applyCeiling(F + 30, F, C) < F + 30 && applyCeiling(F + 30, F, C) > F,
  );
  check("it is monotone, so the ordering survives", (() => {
    let prev = -Infinity;
    for (let x = 0; x < 400; x += 0.5) {
      const v = applyCeiling(x, F, C);
      if (v < prev) return false;
      prev = v;
    }
    return true;
  })());
  // The actual guard on the bug: unbounded, an extreme team read 94 points a
  // game. Nothing may cross the ceiling however extreme the inputs.
  //
  // `<=` rather than `<`: the curve only approaches the ceiling in algebra, but
  // the exponential underflows to zero somewhere past x ≈ 2,000 and it lands
  // exactly on it. Sitting on the ceiling is correct; crossing it is the bug.
  check(
    "nothing can cross the ceiling, however extreme",
    [100, 500, 5000, 1e6].every((x) => applyCeiling(x, F, C) <= C),
    `${applyCeiling(1e6, F, C).toFixed(2)} at one million`,
  );

  // And end to end: a monstrous team on a thin schedule, the shape that
  // produced 94 in the first place.
  const teams = [team("Monster", "6A", 40), team("Weak", "1A", -25), team("Mid", "3A", 0)];
  const res = solve(teams, [
    game("Monster", 84, "Weak", 0, 0),
    game("Monster", 77, "Mid", 0, 1),
    game("Monster", 90, "Weak", 0, 2),
  ]);
  const worst = Math.max(...res.ratings.map((r) => r.adj_o as number));
  check(
    "even a 3-0 side winning by 80 a week stays under it",
    worst < C,
    `AdjO ${worst.toFixed(1)} against ceiling ${C}`,
  );
}

console.log(
  failures === 0
    ? "\nTwo-way engine invariants hold.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
