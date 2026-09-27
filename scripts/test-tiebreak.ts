/**
 * The AHSAA tie-breaking procedure, (a) through (q).
 *
 * The rule is easy to implement as something it is not. It is not a sort: it
 * settles one place at a time and refuses to look at the rest of the group
 * until the top of it is decided. And its factors narrow rather than order —
 * a factor names the team or teams that lead, and if that is more than one the
 * procedure starts again among just those. Both of those are what the checks
 * below are really aimed at.
 *
 * Section 4 is the one that matters most. The published rule contains its own
 * worked exception: a three-way tie for first skips to (f). Nothing here
 * implements that exception. It falls out of treating a place held by a tied
 * team as a factor that does not apply — so if section 4 passes, the reading
 * of (c) through (j) is very likely right.
 *
 * Usage: npx tsx scripts/test-tiebreak.ts
 */
import {
  orderRegion,
  pickHighest,
  TIE_RULES,
  type TieContext,
  type TieGame,
} from "../src/lib/tiebreak";
import type { Record2 } from "../src/lib/season";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A tiny season: who beat whom, plus whatever else a factor asks for. */
function world(opts: {
  /** "A>B" — A beat B in a region game. */
  region?: string[];
  /** "A>X" — A beat X outside the region. */
  outside?: string[];
  /** Region order, for the No. N ranked team factors. */
  places?: string[];
  victories?: Record<string, number>;
  classOrder?: Record<string, number>;
  rating?: Record<string, number>;
}): TieContext {
  const beat = new Set<string>();
  const met = new Set<string>();
  const results = new Map<string, TieGame[]>();
  const add = (t: string, g: TieGame) => {
    const l = results.get(t) ?? [];
    l.push(g);
    results.set(t, l);
  };
  for (const spec of opts.region ?? []) {
    const [w, l] = spec.split(">");
    beat.add(`${w}|${l}`);
    met.add(`${w}|${l}`);
    met.add(`${l}|${w}`);
    add(w, { opponent: l, won: true, required: true });
    add(l, { opponent: w, won: false, required: true });
  }
  for (const spec of opts.outside ?? []) {
    const [w, l] = spec.split(">");
    add(w, { opponent: l, won: true, required: false });
    add(l, { opponent: w, won: false, required: false });
  }
  return {
    beat: (a, b) => beat.has(`${a}|${b}`),
    metRequired: (a, b) => met.has(`${a}|${b}`),
    teamAtPlace: (p) => (opts.places ?? [])[p - 1] ?? null,
    results: (t) => results.get(t) ?? [],
    victories: (t) => opts.victories?.[t] ?? 0,
    classOrder: (t) => opts.classOrder?.[t] ?? 5,
    rating: (t) => opts.rating?.[t] ?? 0,
  };
}

console.log("\n1. (a) two teams: the one that won the game");
{
  const ctx = world({ region: ["B>A"], rating: { A: 99, B: 1 } });
  check("the winner goes above, whatever the rating says",
    pickHighest(["A", "B"], ctx) === "B");
  check("and the order of the arguments does not matter",
    pickHighest(["B", "A"], ctx) === "B");
}

console.log("\n2. (b) more than two: only a team that beat them all");
{
  const swept = world({ region: ["A>B", "A>C", "B>C"] });
  check("a team that beat both is highest", pickHighest(["A", "B", "C"], swept) === "A");

  // A beat B, B beat C, C beat A. Nobody swept, so the factor cannot resolve
  // it and the procedure has to move on.
  const cycle = world({
    region: ["A>B", "B>C", "C>A"],
    places: ["Z", "A", "B", "C"],
  });
  check(
    "a three-way cycle is not resolved by head-to-head",
    TIE_RULES[0].apply(["A", "B", "C"], cycle) === null,
  );
}

console.log("\n3. A factor that leaves two in front hands it to head-to-head");
{
  // A and B both beat the No. 1 team; C did not. Between A and B, B won.
  const ctx = world({
    region: ["A>Z", "B>Z", "Z>C", "B>A", "A>C", "B>C"],
    places: ["Z", "A", "B", "C"],
  });
  check(
    "the two that beat the No. 1 team lead, and their game decides",
    pickHighest(["A", "B", "C"], ctx) === "B",
  );
}

console.log("\n4. The published exception: a three-way tie for first skips to (f)");
{
  // Places 1, 2 and 3 are the tied teams themselves, so (c), (d) and (e) have
  // nothing to compare against. The first factor with a team outside the tie
  // is (f), the No. 4 side. Nothing implements this; it falls out.
  const ctx = world({
    region: ["A>B", "B>C", "C>A", "A>D", "D>B", "D>C"],
    places: ["A", "B", "C", "D"],
  });
  for (const [i, key] of [
    [1, "vs1"],
    [2, "vs2"],
    [3, "vs3"],
  ] as [number, string][]) {
    check(
      `(${"cde"[i - 1]}) does not apply — place ${i} is inside the tie`,
      TIE_RULES.find((r) => r.key === key)!.apply(["A", "B", "C"], ctx) === null,
    );
  }
  const f = TIE_RULES.find((r) => r.key === "vs4")!.apply(["A", "B", "C"], ctx);
  check(
    "(f) does apply, and A is the only one to beat the No. 4 team",
    JSON.stringify(f) === JSON.stringify(["A"]),
    JSON.stringify(f),
  );
  check("so A is the highest of the three", pickHighest(["A", "B", "C"], ctx) === "A");
}

console.log("\n5. One place at a time, restarting for the rest");
{
  // A sweeps the group. B and C are left, and B beat C — so the order is
  // A, B, C even though C is rated far higher.
  const ctx = world({
    region: ["A>B", "A>C", "B>C"],
    rating: { A: 1, B: 2, C: 99 },
  });
  const rec = (): Record2 => ({ wins: 2, losses: 1 });
  const order = orderRegion(["C", "B", "A"], rec, (at) => ({
    ...ctx,
    teamAtPlace: at,
  }));
  check("A, B, C", order.join() === "A,B,C", order.join());
}

console.log("\n6. (k) non-region common opponents");
{
  // X and Y are the only opponents both played outside the region. A beat
  // both; B beat neither. Nothing earlier separates them.
  const ctx = world({
    region: ["A>Z", "B>Z"],
    outside: ["A>X", "A>Y", "X>B", "Y>B"],
    places: ["Z", "A", "B"],
  });
  const k = TIE_RULES.find((r) => r.key === "common")!;
  check("the better record against them leads",
    JSON.stringify(k.apply(["A", "B"], ctx)) === JSON.stringify(["A"]));

  // No shared outside opponent: the factor does not apply.
  const none = world({ outside: ["A>X", "B>Y"] });
  check("no common opponent means the factor is skipped",
    k.apply(["A", "B"], none) === null);
}

console.log("\n7. The 'defeated opponents' factors count the right wins");
{
  // A beat a 9-win team outside the region; B beat a 1-win team.
  const ctx = world({
    outside: ["A>Strong", "B>Weak"],
    victories: { Strong: 9, Weak: 1 },
  });
  const n = TIE_RULES.find((r) => r.key === "defeatedWins")!;
  check("beating a better team counts for more",
    JSON.stringify(n.apply(["A", "B"], ctx)) === JSON.stringify(["A"]));

  // (l) only counts opponents in class, above, or within two below.
  const l = TIE_RULES.find((r) => r.key === "nonRegionStrength")!;
  const far = world({
    outside: ["A>TooSmall", "B>Nearby"],
    victories: { TooSmall: 9, Nearby: 3 },
    // A is 6A (8); its opponent is 2A (4), five classes down.
    classOrder: { A: 8, B: 8, TooSmall: 4, Nearby: 7 },
  });
  check(
    "a win three or more classes down does not count toward (l)",
    JSON.stringify(l.apply(["A", "B"], far)) === JSON.stringify(["B"]),
    JSON.stringify(l.apply(["A", "B"], far)),
  );

  // Off the roster entirely — eligibility unknowable, so left out.
  const oos = world({
    outside: ["A>Outsider", "B>Known"],
    victories: { Outsider: 9, Known: 2 },
    classOrder: { A: 5, B: 5, Known: 5 },
  });
  const ctxOos: TieContext = {
    ...oos,
    classOrder: (t) => (t === "Outsider" ? null : (oos.classOrder(t) ?? 5)),
  };
  check(
    "a school off the roster contributes nothing",
    JSON.stringify(n.apply(["A", "B"], ctxOos)) === JSON.stringify(["B"]),
  );
}

console.log("\n8. The equal-games factors stand down when games differ");
{
  // A has played one game, B has played two, so the factors conditioned on an
  // equal number of games have to stand down.
  const uneven: TieContext = {
    ...world({
      outside: ["A>X", "B>Y", "B>Z"],
      victories: { X: 5, Y: 1, Z: 1, A: 1, B: 2 },
    }),
  };
  for (const key of ["nonRegionStrength", "defeatedWinsEqual", "winsEqual"]) {
    check(
      `${key} does not apply when the tied teams played different numbers of games`,
      TIE_RULES.find((r) => r.key === key)!.apply(["A", "B"], uneven) === null,
    );
  }
  check(
    "but the version without that condition still does",
    TIE_RULES.find((r) => r.key === "wins")!.apply(["A", "B"], uneven) !== null,
  );
}

console.log("\n9. (q) is a coin flip, so it is replaced by something steady");
{
  const ctx = world({ rating: { A: 10, B: 20 } });
  check("the higher-rated team takes it", pickHighest(["A", "B"], ctx) === "B");
  check("and takes it again", pickHighest(["B", "A"], ctx) === "B");
  const level = world({ rating: { A: 5, B: 5 } });
  check("a dead heat falls to the name, so it never reshuffles",
    pickHighest(["B", "A"], level) === "A");
}

console.log("\n10. Every factor is reachable and none of them throws");
{
  const empty = world({});
  for (const rule of TIE_RULES) {
    let ok = true;
    try {
      rule.apply(["A", "B", "C"], empty);
    } catch {
      ok = false;
    }
    check(`${rule.key} survives a season with no games in it`, ok);
  }
  // (a) and (b) ask the same question of two teams and of more than two, so
  // they are one rule here; (q) is the fallback rather than a rule. That
  // leaves fifteen for the seventeen published letters.
  check(
    "fifteen factors, covering (a) through (p)",
    TIE_RULES.length === 15,
    `${TIE_RULES.length}`,
  );
}

console.log(
  failures === 0
    ? "\nThe tiebreakers behave.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
