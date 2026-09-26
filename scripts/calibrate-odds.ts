/**
 * Fits the win-probability curve the playoff odds are built on.
 *
 * Everything on the odds page reduces to one question asked ten thousand
 * times: given a rating gap, how often does the better team win? That is a
 * logistic curve with a single free parameter — the scale, in rating points,
 * over which a gap turns into a near-certainty. Guessing it would make every
 * percentage on the page confident nonsense, so it is fitted here against real
 * football and the fit is scored for calibration, not just for accuracy.
 *
 * Method, borrowed from validate-2025-season.ts: rate on every week BEFORE N,
 * predict week N, weeks 4-10 of the 2025 season. Nothing about week N is
 * visible when week N is predicted. The 2025 export carries no site
 * information (rows are winner-first, not home-first) so every game is
 * neutral, and the carry-over priors we hold were derived from these same
 * results, so teams start from their classification baseline alone.
 *
 * Usage: npx tsx scripts/calibrate-odds.ts
 */
import { readFileSync } from "node:fs";
import { computeRatings } from "../src/lib/engine";
import { computeTwoWay } from "../src/lib/engine-twoway";
import { parseCsvText } from "../src/lib/csv";
import {
  CONFIG_2025,
  DEFAULT_CONFIG,
  TWOWAY_DEFAULTS,
  type Classification,
  type Game,
  type Team,
} from "../src/lib/types";

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
const TEST = [4, 5, 6, 7, 8, 9, 10];

/** Rating gaps from the winner's point of view, out of sample. */
function gaps(model: "classic" | "twoway"): number[] {
  const out: number[] = [];
  for (const wk of TEST) {
    const prior = games.filter((g) => g.week < wk);
    const ratings =
      model === "twoway"
        ? computeTwoWay(teams, prior, {
            ...TWOWAY_DEFAULTS,
            lambda: 1,
            recency: 1,
            hfa: 0,
          }).ratings
        : computeRatings(teams, prior, {
            ...DEFAULT_CONFIG,
            ...CONFIG_2025,
            hfa: 0,
          }).ratings;
    const r = new Map(ratings.map((x) => [x.name, x.rating]));
    for (const g of games) {
      if (g.week !== wk) continue;
      if (!known.has(g.t1) || !known.has(g.t2)) continue;
      // Rows are winner-first, so this is always the winner's margin of
      // rating. A negative one is an upset, and those are what identify the
      // scale — without them any scale near zero would look perfect.
      out.push((r.get(g.t1) ?? 0) - (r.get(g.t2) ?? 0));
    }
  }
  return out;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Log-likelihood of the observed winners under a given scale. */
const logLik = (d: number[], s: number) =>
  d.reduce((a, x) => a + Math.log(Math.max(1e-12, sigmoid(x / s))), 0);

/** Golden-section search — one parameter, smooth, bounded. */
function bestScale(d: number[]): number {
  let lo = 0.5,
    hi = 60;
  const phi = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 200; i++) {
    const a = hi - phi * (hi - lo);
    const b = lo + phi * (hi - lo);
    if (logLik(d, a) > logLik(d, b)) hi = b;
    else lo = a;
  }
  return (lo + hi) / 2;
}

for (const model of ["classic", "twoway"] as const) {
  const d = gaps(model);
  const s = bestScale(d);
  const acc = d.filter((x) => x > 0).length / d.length;

  // Calibration: does a stated 70% actually win 70% of the time? The gaps are
  // all winner-first, so half are flipped to make the sample symmetric —
  // without that every observed outcome is a win and the check is vacuous.
  const buckets = new Map<number, { n: number; won: number; p: number }>();
  d.forEach((gap, i) => {
    const flip = i % 2 === 1;
    const x = flip ? -gap : gap;
    const won = flip ? 0 : 1;
    const p = sigmoid(x / s);
    const k = Math.min(9, Math.floor(p * 10));
    const b = buckets.get(k) ?? { n: 0, won: 0, p: 0 };
    b.n++;
    b.won += won;
    b.p += p;
    buckets.set(k, b);
  });

  console.log(`\n=== ${model} ===`);
  console.log(`  games          ${d.length}`);
  console.log(`  winner accuracy ${(acc * 100).toFixed(1)}%`);
  console.log(`  best scale      ${s.toFixed(2)} rating points`);
  console.log(
    `  a ${DEFAULT_CONFIG.hfa}-point edge is worth ${(sigmoid(DEFAULT_CONFIG.hfa / s) * 100).toFixed(1)}%`,
  );
  console.log("  predicted → actual");
  let mae = 0;
  let tot = 0;
  for (const k of [...buckets.keys()].sort((a, b) => a - b)) {
    const b = buckets.get(k)!;
    const pred = b.p / b.n;
    const act = b.won / b.n;
    mae += Math.abs(pred - act) * b.n;
    tot += b.n;
    console.log(
      `    ${(k * 10).toString().padStart(2)}-${k * 10 + 10}%  n=${String(b.n).padStart(4)}  said ${(pred * 100).toFixed(1).padStart(5)}%  won ${(act * 100).toFixed(1).padStart(5)}%`,
    );
  }
  console.log(`  mean calibration error ${((mae / tot) * 100).toFixed(2)} points`);
}
