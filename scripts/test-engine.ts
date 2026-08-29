/**
 * Invariant checks for the rating engine.
 *
 * These guard the properties PROJECT.md calls load-bearing — the ones that,
 * if broken, produce plausible-looking wrong numbers rather than an error.
 *
 * This is NOT a substitute for validating against the 2025 season. That check
 * (run the engine over 2025's ~2,050 games and diff team-by-team against the
 * PHP output) still needs the 2025 game data.
 */
import {
  classPrior,
  classifyPerformance,
  computeRatings,
  expectedMargin,
  isPlayed,
} from "../src/lib/engine";
import { DEFAULT_CONFIG, type Game, type Team } from "../src/lib/types";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const team = (
  name: string,
  classification: Team["classification"],
  region = 1,
  prior: number | null = null,
): Team => ({
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  classification,
  region,
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
  t1,
  s1,
  t2,
  s2,
  week,
  type: "regular",
  round: null,
  date: null,
  status: "scheduled",
  ...extra,
});

console.log("\n1. Score presence is authoritative (status is ignored)");
{
  const teams = [team("A", "6A"), team("B", "6A")];
  // A scheduled-but-unplayed game must not read as a 0-0 tie.
  const withNulls = computeRatings(teams, [
    game("A", null, "B", null, 5, { status: "final" }),
  ]);
  check(
    "null scores produce no record",
    withNulls.ratings.every((r) => r.wins === 0 && r.losses === 0),
  );
  check(
    "null-scored games leave maxWeekPlayed at 0",
    withNulls.maxWeekPlayed === 0,
    `got ${withNulls.maxWeekPlayed}`,
  );
  check(
    "a 0-0 game IS played",
    isPlayed(game("A", 0, "B", 0)) && !isPlayed(game("A", 0, "B", null)),
  );
}

console.log("\n2. prior_blend decays over played weeks only");
{
  const teams = [team("A", "6A", 1, 40), team("B", "6A", 1, 10)];
  const wk0 = computeRatings(teams, [game("A", 21, "B", 14, 0)]);
  check("week 0 → blend 1.0", wk0.priorBlend === 1, `got ${wk0.priorBlend}`);

  const wk2 = computeRatings(teams, [game("A", 21, "B", 14, 2)]);
  check("week 2 → blend 0.5", wk2.priorBlend === 0.5, `got ${wk2.priorBlend}`);

  const wk4 = computeRatings(teams, [game("A", 21, "B", 14, 4)]);
  check("week 4 → blend 0", wk4.priorBlend === 0, `got ${wk4.priorBlend}`);

  // A full season loaded in advance must not erase the prior.
  const loaded = computeRatings(teams, [
    game("A", 21, "B", 14, 0),
    game("A", null, "B", null, 10),
  ]);
  check(
    "unplayed week 10 does not erase the prior",
    loaded.priorBlend === 1,
    `got ${loaded.priorBlend}`,
  );
}

console.log("\n3. Class priors keep an undefeated 1A below a strong 6A");
{
  // The failure that motivated the whole design: a small-school team that
  // blows out its own classification should not top the ladder.
  const teams: Team[] = [
    team("Tiny 1A", "1A", 1),
    ...Array.from({ length: 6 }, (_, i) => team(`1A Foe ${i}`, "1A", 1)),
    team("Big 6A", "6A", 1),
    ...Array.from({ length: 6 }, (_, i) => team(`6A Foe ${i}`, "6A", 1)),
  ];
  const games: Game[] = [];
  for (let i = 0; i < 6; i++) {
    games.push(game("Tiny 1A", 49, `1A Foe ${i}`, 0, i + 1));
    // The 6A team wins by less, against much better competition.
    games.push(game("Big 6A", 31, `6A Foe ${i}`, 17, i + 1));
  }
  // Give the 6A slate real strength so SOS separates them.
  for (let i = 0; i < 5; i++) {
    games.push(game(`6A Foe ${i}`, 35, `6A Foe ${i + 1}`, 14, 7));
  }

  const res = computeRatings(teams, games);
  const tiny = res.ratings.find((r) => r.name === "Tiny 1A")!;
  const big = res.ratings.find((r) => r.name === "Big 6A")!;
  check(
    "undefeated 1A ranks below the 6A team",
    big.rank < tiny.rank,
    `6A rank ${big.rank} (${big.rating.toFixed(2)}), 1A rank ${tiny.rank} (${tiny.rating.toFixed(2)})`,
  );
}

console.log("\n4. The prior is re-applied every iteration, not just seeded");
{
  // If the prior were only a seed, iteration count would barely matter for a
  // team with games. Re-application pins the result regardless of iterations.
  const teams = [team("A", "6A", 1, 50), team("B", "1A", 1, 0)];
  const games = [game("A", 28, "B", 0, 1)];
  const few = computeRatings(teams, games, { iters: 5 });
  const many = computeRatings(teams, games, { iters: 300 });
  const drift = Math.abs(
    (few.ratings.find((r) => r.name === "A")!.rating -
      many.ratings.find((r) => r.name === "A")!.rating),
  );
  check(
    "ratings converge (iteration count is not load-bearing)",
    drift < 0.5,
    `drift ${drift.toFixed(4)}`,
  );
}

console.log("\n5. Margin cap limits blowout farming");
{
  const teams = [team("A", "4A"), team("B", "4A"), team("C", "4A")];
  const modest = computeRatings(teams, [game("A", 28, "B", 0, 1)]);
  const absurd = computeRatings(teams, [game("A", 84, "B", 0, 1)]);
  const a1 = modest.ratings.find((r) => r.name === "A")!.massey;
  const a2 = absurd.ratings.find((r) => r.name === "A")!.massey;
  check(
    "winning by 84 rates the same as winning by 28 (cap = 28)",
    Math.abs(a1 - a2) < 1e-9,
    `${a1.toFixed(4)} vs ${a2.toFixed(4)}`,
  );
}

console.log("\n6. Out-of-state opponents count for record, not for strength");
{
  const teams = [team("A", "5A"), team("B", "5A")];
  const res = computeRatings(teams, [
    game("A", 35, "Northview (FL)", 7, 1),
    game("A", 21, "B", 14, 2),
    game("B", 28, "C-Nonexistent", 0, 3),
  ]);
  const a = res.ratings.find((r) => r.name === "A")!;
  check("OOS win counts toward the record", a.wins === 2, `wins ${a.wins}`);

  const rpiA = res.rpi.find((r) => r.name === "A")!;
  check(
    "OOS win counts toward RPI win%",
    Math.abs(rpiA.win_pct - 1) < 1e-9,
    `win_pct ${rpiA.win_pct}`,
  );
  check(
    "OOS opponent excluded from RPI opponent strength",
    // A's only in-state opponent is B (1-1 → .500).
    Math.abs(rpiA.opp_win_pct - 0.5) < 1e-9,
    `opp_win_pct ${rpiA.opp_win_pct}`,
  );
}

console.log("\n7. RPI weighting is 25 / 50 / 25");
{
  const teams = [team("A", "3A"), team("B", "3A"), team("C", "3A")];
  const res = computeRatings(teams, [
    game("A", 20, "B", 10, 1),
    game("B", 20, "C", 10, 2),
    game("C", 20, "A", 10, 3),
  ]);
  for (const r of res.rpi) {
    const expected =
      0.25 * r.win_pct + 0.5 * r.opp_win_pct + 0.25 * r.opp_opp_win_pct;
    check(
      `RPI formula holds for ${r.name}`,
      Math.abs(r.rpi - expected) < 1e-12,
    );
  }
}

console.log("\n8. Teams with no games hold their effective prior");
{
  const teams = [team("Played", "6A", 1, 30), team("Idle", "6A", 1, 30)];
  const res = computeRatings(teams, [game("Played", 21, "Other", 0, 1)]);
  const idle = res.ratings.find((r) => r.name === "Idle")!;

  // One played week → blend 0.75, so the carry-over is mixed with the 6A
  // class baseline rather than used raw.
  const blend = 0.75;
  const cls6A = classPrior("6A", DEFAULT_CONFIG);
  const effective = blend * 30 + (1 - blend) * cls6A;

  check(
    "idle team's massey equals its effective prior",
    Math.abs(idle.massey - effective) < 1e-9,
    `got ${idle.massey}, expected ${effective}`,
  );
  check(
    "idle team gets no SOS or win-rate adjustment",
    Math.abs(idle.rating - effective) < 1e-9,
    `rating ${idle.rating} vs massey ${idle.massey}`,
  );
  check("idle team has no record", idle.wins === 0 && idle.losses === 0);
}

console.log("\n9. Playoff rounds weigh more than regular season");
{
  const teams = [team("A", "6A"), team("B", "6A")];
  const reg = computeRatings(teams, [game("A", 21, "B", 0, 11)]);
  const champ = computeRatings(teams, [
    game("A", 21, "B", 0, 11, { type: "playoff", round: "r5" }),
  ]);
  const gap = (r: typeof reg) =>
    r.ratings.find((x) => x.name === "A")!.massey -
    r.ratings.find((x) => x.name === "B")!.massey;
  check(
    "championship win separates teams more than a regular win",
    gap(champ) > gap(reg),
    `${gap(champ).toFixed(3)} vs ${gap(reg).toFixed(3)}`,
  );
}

console.log("\n10. Prediction helpers");
{
  const cfg = DEFAULT_CONFIG;
  check(
    "home field advantage applies on non-neutral sites",
    expectedMargin(20, 10, cfg) === 12 && expectedMargin(20, 10, cfg, true) === 10,
  );
  check(
    "beating a +3 projection by 25 is dominant",
    classifyPerformance(28, 3, cfg) === "dominant",
  );
  check(
    "beating a +3 projection by 10 exceeds",
    classifyPerformance(13, 3, cfg) === "exceeded",
  );
  check(
    "winning by 5 against a +3 projection is as expected",
    classifyPerformance(5, 3, cfg) === "as-expected",
  );
  check(
    "losing by 10 against a +3 projection is below",
    classifyPerformance(-10, 3, cfg) === "below",
  );
}

console.log("\n11. The private bracket is not seeded below 1A");
{
  // AA and A are listed after 1A on the roster, but that is an ordering of
  // the list, not of playing strength. Seeding them at the bottom would
  // penalise every private school before a snap.
  check(
    "AA is seeded exactly like 4A",
    classPrior("AA", DEFAULT_CONFIG) === classPrior("4A", DEFAULT_CONFIG),
    `AA ${classPrior("AA", DEFAULT_CONFIG)} vs 4A ${classPrior("4A", DEFAULT_CONFIG)}`,
  );
  check(
    "A is seeded exactly like 2A",
    classPrior("A", DEFAULT_CONFIG) === classPrior("2A", DEFAULT_CONFIG),
    `A ${classPrior("A", DEFAULT_CONFIG)} vs 2A ${classPrior("2A", DEFAULT_CONFIG)}`,
  );
  check(
    "both sit above 1A",
    classPrior("A", DEFAULT_CONFIG) > classPrior("1A", DEFAULT_CONFIG) &&
      classPrior("AA", DEFAULT_CONFIG) > classPrior("1A", DEFAULT_CONFIG),
  );
  check(
    "the public ladder is untouched",
    classPrior("1A", DEFAULT_CONFIG) < classPrior("2A", DEFAULT_CONFIG) &&
      classPrior("2A", DEFAULT_CONFIG) < classPrior("3A", DEFAULT_CONFIG) &&
      classPrior("3A", DEFAULT_CONFIG) < classPrior("4A", DEFAULT_CONFIG) &&
      classPrior("4A", DEFAULT_CONFIG) < classPrior("5A", DEFAULT_CONFIG) &&
      classPrior("5A", DEFAULT_CONFIG) < classPrior("6A", DEFAULT_CONFIG),
  );
}

console.log("\n12. Reseeding the private bracket cannot move a preseason board");
{
  // The guarantee the whole site rests on: nothing moves until a game is
  // played. With no results the blend is 1, so the class baseline — whatever
  // it is set to — contributes nothing at all.
  const teams = [
    team("Private", "AA", 1, 12.5),
    team("Small", "1A", 1, 12.5),
    team("Big", "6A", 1, 40),
  ];
  const res = computeRatings(teams, []);
  for (const t of teams) {
    const got = res.ratings.find((r) => r.name === t.name)!;
    check(
      `${t.name} still rated ${t.preseason_prior}`,
      Math.abs(got.rating - (t.preseason_prior as number)) < 1e-9,
      `got ${got.rating}`,
    );
  }
}

console.log("\n13. The early anchor damps week 0 and then gets out of the way");
{
  // St. Michael's actual week 0: a 23.95 team losing by 28 to an out-of-state
  // opponent, which the engine can only value at the field mean. At anchor 0
  // that one game carried 78% of the rating and dropped them ~40 points.
  const roster = () => [
    team("Strong", "AA", 1, 23.95),
    team("Other", "5A", 1, 12),
    team("Third", "3A", 1, 6),
  ];
  const wk0 = [game("Away Academy GA", 31, "Strong", 3, 0)];

  const damped = computeRatings(roster(), wk0, { early_anchor: 0.8 });
  const raw = computeRatings(roster(), wk0, { early_anchor: 0 });
  const s = (r: ReturnType<typeof computeRatings>) =>
    r.ratings.find((x) => x.name === "Strong")!.rating;

  check(
    "one week 0 loss costs less with the anchor than without",
    s(damped) > s(raw),
    `anchored ${s(damped).toFixed(2)} vs raw ${s(raw).toFixed(2)}`,
  );
  check(
    "the team still drops — the anchor damps, it does not freeze",
    s(damped) < 23.95,
    `got ${s(damped).toFixed(2)}`,
  );

  // The whole reason validating against a finished season could not catch
  // this: once four weeks are played the two are the same computation.
  const season = [
    game("Strong", 21, "Other", 14, 0),
    game("Other", 20, "Third", 17, 2),
    game("Strong", 28, "Third", 7, 4),
  ];
  const lateA = computeRatings(roster(), season, { early_anchor: 0 });
  const lateB = computeRatings(roster(), season, { early_anchor: 0.8 });
  check("prior_blend has reached 0 by week 4", lateA.priorBlend === 0);
  const worst = Math.max(
    ...lateA.ratings.map((r) =>
      Math.abs(r.rating - lateB.ratings.find((x) => x.name === r.name)!.rating),
    ),
  );
  check(
    "and from there the anchor changes nothing at all",
    worst === 0,
    `worst difference ${worst}`,
  );
}

console.log("\n14. Losing badly cannot raise a rating");
{
  // Parker's actual week 0: a 23.85 team beaten by three scores by the
  // strongest side on the board, and its rating went UP. After one game SOS
  // is just that opponent's rating, so the season-calibrated schedule bonus
  // was worth more than the loss cost.
  // A field wide enough for the median SOS to mean something — with only a
  // handful of teams every schedule looks extreme and the term misbehaves for
  // a different reason.
  const roster = () => {
    const out = [
      team("Parker", "5A", 5, 23.85),
      team("Giant", "6A", 3, 36.97),
    ];
    for (let i = 0; i < 24; i++) {
      out.push(team(`Filler ${i}`, "4A", 1, 12 - i * 0.9));
    }
    return out;
  };
  const wk0 = [game("Giant", 42, "Parker", 21, 0)];
  for (let i = 0; i + 1 < 24; i += 2) {
    wk0.push(game(`Filler ${i}`, 24, `Filler ${i + 1}`, 20, 0));
  }

  const parker = (r: ReturnType<typeof computeRatings>) =>
    r.ratings.find((x) => x.name === "Parker")!.rating;

  const ramped = computeRatings(roster(), wk0, { sos_ramp: 4 });
  const unramped = computeRatings(roster(), wk0, { sos_ramp: 1 });
  // sos_w 0 removes the schedule term entirely, which isolates its size.
  const noSos = computeRatings(roster(), wk0, { sos_w: 0 });

  check(
    "without the ramp, a three-score loss raises the rating",
    parker(unramped) > 23.85,
    `got ${parker(unramped).toFixed(2)}`,
  );

  // The exact guarantee: after one game the schedule bonus is worth a quarter
  // of full strength. Whether that is enough to stop a rise depends on the
  // shape of the field, so the invariant is the fraction, not the sign.
  const fullTerm = parker(unramped) - parker(noSos);
  const rampedTerm = parker(ramped) - parker(noSos);
  check(
    "one game earns a quarter of the schedule adjustment",
    Math.abs(rampedTerm - fullTerm * 0.25) < 1e-9,
    `${rampedTerm.toFixed(4)} vs ${(fullTerm * 0.25).toFixed(4)}`,
  );
  check(
    "which is a real reduction, not a rounding difference",
    fullTerm > 5 && rampedTerm < fullTerm * 0.3,
    `full ${fullTerm.toFixed(2)}, ramped ${rampedTerm.toFixed(2)}`,
  );

  // Every team in the validated 2025 set played at least seven games, so the
  // ramp is already at full strength there and cannot disturb it.
  const full = [
    game("Parker", 21, "Filler 0", 14, 0),
    game("Parker", 20, "Filler 1", 17, 1),
    game("Giant", 30, "Parker", 10, 2),
    game("Parker", 24, "Filler 2", 21, 3),
  ];
  const a = computeRatings(roster(), full, { sos_ramp: 4 });
  const b = computeRatings(roster(), full, { sos_ramp: 1 });
  check(
    "at four games played the ramp is inert",
    Math.abs(parker(a) - parker(b)) < 1e-9,
    `${parker(a)} vs ${parker(b)}`,
  );
}

console.log("\n15. Efficiency measures you against everyone ELSE");
{
  const roster = () => [
    team("Saraland", "6A", 1, 30),
    team("X", "6A", 1, 8),
    team("Y", "6A", 1, 25),
  ];

  // Nobody has a common opponent yet, so there is no baseline to measure
  // against and every figure must be zero — not a number derived from the
  // team's own game against itself.
  const wk0 = computeRatings(roster(), [game("Saraland", 31, "X", 14, 0)]);
  const s0 = wk0.ratings.find((r) => r.name === "Saraland")!;
  check(
    "no common opponent yet → no efficiency figure",
    s0.o_eff === 0 && s0.d_eff === 0,
    `O ${s0.o_eff}, D ${s0.d_eff}`,
  );

  // Y beat X 35-0; Saraland beat the same X 21-14. Saraland scored 14 fewer
  // than X gives up to everyone else, and allowed 14 more than X scores on
  // them. The team's own game is excluded from X's averages, so these are
  // the full gaps rather than half of them.
  const res = computeRatings(roster(), [
    game("Y", 35, "X", 0, 0),
    game("Saraland", 21, "X", 14, 1),
  ]);
  const s = res.ratings.find((r) => r.name === "Saraland")!;
  check(
    "measured against X's record versus everyone else",
    Math.abs(s.o_eff - (21 - 35)) < 1e-9 && Math.abs(s.d_eff - (0 - 14)) < 1e-9,
    `O ${s.o_eff.toFixed(2)} (want -14), D ${s.d_eff.toFixed(2)} (want -14)`,
  );

  // Out-of-state opponents keep no record here, so they contribute no
  // baseline at all rather than a zero that drags the average.
  const oos = computeRatings(roster(), [
    game("Y", 35, "X", 0, 0),
    game("Saraland", 40, "Somewhere GA", 0, 1),
    game("Saraland", 21, "X", 14, 2),
  ]);
  const so = oos.ratings.find((r) => r.name === "Saraland")!;
  check(
    "an out-of-state opponent adds no baseline",
    Math.abs(so.o_eff - ((21 + 40) / 2 - 35)) < 1e-9,
    `got ${so.o_eff.toFixed(2)}`,
  );
}

console.log(
  failures === 0
    ? "\nAll engine invariants hold.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
