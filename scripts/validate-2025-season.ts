/**
 * Validates the two-way engine against the whole 2025 season.
 *
 * This is the real test the project lacked for a long time. `validate-2025.ts`
 * only re-derives the composite arithmetic from exported columns; this runs
 * the engine over 2,050 actual games and asks whether it can predict football.
 *
 * Method: rate on every week BEFORE N, predict week N, score it. Weeks 4-10,
 * so every team has four or more games behind it. Nothing about week N is
 * visible when week N is predicted.
 *
 * Two constraints the data forces, both load-bearing:
 *
 *  - Every game is NEUTRAL. The export is recorded winner-first, not
 *    home-first, so it holds no site information. Fed in as home-vs-away it
 *    would teach the model that home teams win by about 24 points.
 *  - No carry-over prior. The 2026 priors we hold were DERIVED from these
 *    results, so using them here would be leakage. Teams start from their
 *    classification baseline alone.
 *
 * Usage: npx tsx scripts/validate-2025-season.ts
 */
import { readFileSync } from "node:fs";
import { parseCsvText } from "../src/lib/csv";
import { computeTwoWay } from "../src/lib/engine-twoway";
import {
  TWOWAY_DEFAULTS,
  type Classification,
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

// ---- the 2025 field -------------------------------------------------------
// Names, classifications and the ranks that actually shipped.
const vr = parseCsvText(
  readFileSync("data/validation_2025_expected.csv", "utf8"),
);
const vh = vr[0].map((x) => x.trim());
const vi = (n: string) => vh.indexOf(n);
const teams: Team[] = vr
  .slice(1)
  .filter((r) => r[vi("Team")])
  .map((r) => ({
    name: r[vi("Team")].trim(),
    slug: r[vi("Team")].trim().toLowerCase().replace(/\s+/g, "-"),
    classification: r[vi("Class")].trim() as Classification,
    region: Number(r[vi("Region")]) || 1,
    preseason_prior: null,
    prior_source: null,
  }));
const publishedRank = new Map(
  vr
    .slice(1)
    .filter((r) => r[vi("Team")])
    .map((r) => [r[vi("Team")].trim(), Number(r[vi("Rank")])]),
);

const gr = parseCsvText(readFileSync("data/alpreps_games_2025.csv", "utf8"));
const gh = gr[0].map((x) => x.trim());
const gi = (n: string) => gh.indexOf(n);
const games: Game[] = gr
  .slice(1)
  .filter((r) => r[gi("winner")])
  .map((r) => ({
    t1: r[gi("winner")].trim(),
    s1: Number(r[gi("winner_score")]),
    t2: r[gi("loser")].trim(),
    s2: Number(r[gi("loser_score")]),
    week: Number(r[gi("week")]),
    type: (r[gi("type")] || "regular") as "regular" | "playoff",
    round: (r[gi("round")] || null) as Game["round"],
    date: null,
    status: "final",
    neutral_site: true,
  }));

const known = new Set(teams.map((t) => t.name));
const CFG = {
  ...TWOWAY_DEFAULTS,
  // A class baseline is a weaker prior than a carry-over rating, so it earns
  // less weight; and there is no carry-over to convert, so hfa/prior_scale
  // are inert here.
  lambda: 1,
  recency: 1,
  hfa: 0,
};

console.log(`2025: ${games.length} games, ${teams.length} teams\n`);

console.log("1. Out-of-sample prediction, weeks 4-10");
const TEST = [4, 5, 6, 7, 8, 9, 10];
let hits = 0,
  n = 0,
  abs = 0;
const pairs: [number, number][] = [];
for (const wk of TEST) {
  const { ratings } = computeTwoWay(
    teams,
    games.filter((g) => g.week < wk),
    CFG,
  );
  const rt = new Map(ratings.map((r) => [r.name, r.rating]));
  for (const g of games) {
    if (g.week !== wk) continue;
    if (!known.has(g.t1) || !known.has(g.t2)) continue;
    // Rows are stored winner-first, so scoring them as-is would make the
    // actual margin positive in every single game — selection on the outcome,
    // which quietly destroys the calibration slope. Flip half of them by a
    // stable hash so the test set is symmetric about zero.
    const flip =
      ([...`${g.t1}|${g.t2}|${g.week}`].reduce(
        (h, ch) => (h * 31 + ch.charCodeAt(0)) | 0,
        7,
      ) &
        1) === 1;
    const [a, b] = flip ? [g.t2, g.t1] : [g.t1, g.t2];
    const [sa, sb] = flip ? [g.s2, g.s1] : [g.s1, g.s2];
    const exp = (rt.get(a) as number) - (rt.get(b) as number);
    const act = (sa as number) - (sb as number);
    n++;
    pairs.push([exp, act]);
    if (Math.sign(exp) === Math.sign(act)) hits++;
    abs += Math.abs(exp - act);
  }
}
const acc = hits / n;
const mae = abs / n;
const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
const my = pairs.reduce((s, p) => s + p[1], 0) / n;
let cn = 0,
  cd = 0;
for (const [x, y] of pairs) {
  cn += (x - mx) * (y - my);
  cd += (x - mx) ** 2;
}
const slope = cn / cd;
console.log(
  `  ${n} held-out games · winners ${(acc * 100).toFixed(1)}% · MAE ${mae.toFixed(2)} · calibration slope ${slope.toFixed(2)}`,
);
check("picks winners well above chance", acc > 0.8, `${(acc * 100).toFixed(1)}%`);
check("margin error is football-sized", mae < 15, `MAE ${mae.toFixed(2)}`);
// A slope near 1 means a predicted 10-point win really is a 10-point win. Far
// below 1 is over-confident, far above is timid.
check(
  "projections are calibrated, not merely ordered",
  slope > 0.85 && slope < 1.2,
  `slope ${slope.toFixed(2)}`,
);

console.log("\n2. The finished board is sane");
const full = computeTwoWay(teams, games, CFG);
const rows = full.ratings;
const played = rows.filter((r) => r.wins + r.losses > 0);
const minD = Math.min(...played.map((r) => r.adj_d as number));
const minO = Math.min(...played.map((r) => r.adj_o as number));
console.log(
  `  AdjO ${minO.toFixed(1)}..${Math.max(...played.map((r) => r.adj_o as number)).toFixed(1)} · ` +
    `AdjD ${minD.toFixed(1)}..${Math.max(...played.map((r) => r.adj_d as number)).toFixed(1)}`,
);
// The whole reason for the multiplicative form. An additive version of this
// model put Thompson's adjusted defense at −13 points a game.
check("no team scores or concedes a negative number of points", minD > 0 && minO > 0);
check(
  "the champion is at the top",
  rows[0].name === "Clay-Chalkville",
  `got ${rows[0].name} (15-0 Clay-Chalkville won 6A)`,
);

console.log("\n3. It agrees with the board that shipped");
const cmp = rows
  .filter((r) => publishedRank.has(r.name))
  .map((r) => [r.rank, publishedRank.get(r.name) as number] as [number, number]);
const cn2 = cmp.length;
const ax = cmp.reduce((s, p) => s + p[0], 0) / cn2;
const ay = cmp.reduce((s, p) => s + p[1], 0) / cn2;
let num = 0,
  dx = 0,
  dy = 0;
for (const [x, y] of cmp) {
  num += (x - ax) * (y - ay);
  dx += (x - ax) ** 2;
  dy += (y - ay) ** 2;
}
const corr = num / Math.sqrt(dx * dy);
const meanGap = cmp.reduce((s, [a, b]) => s + Math.abs(a - b), 0) / cn2;
console.log(
  `  rank correlation ${corr.toFixed(3)} over ${cn2} teams · mean gap ${meanGap.toFixed(1)} places`,
);
check("tracks the published 2025 order closely", corr > 0.95, `r = ${corr.toFixed(3)}`);

console.log("\n4. The class baseline is doing its job");
// Without it, AHSAA's almost entirely within-classification schedules leave
// the small classes barely connected to the big ones, and an undefeated 1A
// team floats into the top five.
const flat = computeTwoWay(teams, games, { ...CFG, class_spread: 0 });
const rankIn = (rs: typeof rows, name: string) =>
  rs.find((r) => r.name === name)?.rank ?? 0;
const withBase = rankIn(rows, "Maplesville");
const without = rankIn(flat.ratings, "Maplesville");
console.log(
  `  Maplesville (1A, 14-0): ${without} without a class baseline, ${withBase} with one, ${publishedRank.get("Maplesville")} on the published board`,
);
check(
  "a 14-0 1A team does not float into the top ten",
  withBase > 10,
  `ranked ${withBase}`,
);
check("and the baseline is what stops it", without < withBase, `${without} vs ${withBase}`);

console.log("\n5. AdjO means what it says");
{
  // The check that was missing. Margins were validated from the start; the
  // per-team POINTS were not, and AdjO is a claim about points — "this team
  // would score X against an average AHSAA defense". Unbounded, the model was
  // claiming 94 for the best offense in the state.
  //
  // Tested against the claim rather than against a game-level product: take
  // only the games where the opponent's defense really was close to average,
  // and see whether teams scored near their AdjO in them.
  //
  // This is a sanity check, NOT a tripwire for the 94-point bug. Checked: with
  // the ceiling disabled these same bands read 48.0 against 44.1, which still
  // passes. A full 2025 season with no carry-over never reaches the extremes
  // that three weeks of 2026 with a strong carry-over does. The guard that
  // actually catches it is the unit test on applyCeiling in test-twoway.ts.
  const near: { adjO: number; act: number }[] = [];
  for (const wk of TEST) {
    const r = computeTwoWay(teams, games.filter((g) => g.week < wk), CFG);
    const O = new Map(r.ratings.map((x) => [x.name, x.adj_o as number]));
    const D = new Map(r.ratings.map((x) => [x.name, x.adj_d as number]));
    for (const g of games) {
      if (g.week !== wk) continue;
      if (!known.has(g.t1) || !known.has(g.t2)) continue;
      for (const [me, opp, pts] of [
        [g.t1, g.t2, g.s1],
        [g.t2, g.t1, g.s2],
      ] as [string, string, number][]) {
        const oppD = D.get(opp) as number;
        if (oppD < r.mu * 0.85 || oppD > r.mu * 1.15) continue;
        near.push({ adjO: O.get(me) as number, act: pts });
      }
    }
  }
  const band = (lo: number, hi: number) => {
    const s = near.filter((o) => o.adjO >= lo && o.adjO < hi);
    return {
      n: s.length,
      claim: s.reduce((a, b) => a + b.adjO, 0) / (s.length || 1),
      act: s.reduce((a, b) => a + b.act, 0) / (s.length || 1),
    };
  };
  console.log(
    `  ${near.length} team-games against a genuinely average defense`,
  );
  for (const [lo, hi] of [
    [0, 20],
    [20, 30],
    [30, 40],
    [40, 500],
  ] as [number, number][]) {
    const b = band(lo, hi);
    if (b.n < 15) continue;
    console.log(
      `    AdjO ${String(lo).padStart(2)}-${hi === 500 ? "+ " : String(hi).padEnd(2)}  n=${String(b.n).padStart(4)}  claims ${b.claim.toFixed(1)}  actually scored ${b.act.toFixed(1)}`,
    );
  }
  const top = band(40, 500);
  check(
    "high-scoring teams score near their AdjO against average defenses",
    top.n >= 15 && top.claim / top.act < 1.15,
    `claims ${top.claim.toFixed(1)}, scored ${top.act.toFixed(1)} over ${top.n} games`,
  );
  const maxO = Math.max(...rows.map((r) => r.adj_o as number));
  check(
    "no adjusted offense exceeds the ceiling",
    maxO <= CFG.ceiling,
    `max ${maxO.toFixed(1)}, ceiling ${CFG.ceiling}`,
  );
}

console.log(
  failures === 0
    ? "\nThe two-way engine holds up against a finished season.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
