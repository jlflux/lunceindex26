/**
 * Playoff odds.
 *
 * Every number on the odds page comes from playing the rest of the season ten
 * thousand times. Each unplayed game is decided by a coin weighted by the two
 * ratings, the region tables are rebuilt, the brackets are seeded and played
 * out, and the results are tallied. A team's odds are the share of those
 * seasons in which the thing happened.
 *
 * Three parts of this are facts rather than choices, and they are the parts
 * worth checking:
 *
 *  1. THE BRACKET. Derived from the 2025 season's own playoff results rather
 *     than from memory — see the pod comment below. All six eight-region
 *     classes paired identically in the first round, 95 games out of 96.
 *  2. THE WIN CURVE. One free parameter, fitted out of sample against 2025 by
 *     scripts/calibrate-odds.ts: rate on the weeks before N, predict week N.
 *     It lands at about 7.7 rating points, picks 80-83% of winners, and its
 *     stated probabilities land within about two points of the observed rate
 *     in every decile. A guessed number here would make the whole page
 *     confident nonsense.
 *  3. ELIMINATION AND CLINCHING. Not read off the simulation. Ten thousand
 *     trials without an outcome is not a proof, and "eliminated" is a claim
 *     that deserves one, so both flags come from a separate argument that
 *     cannot be wrong in the direction that matters — see `standingsBounds`.
 *
 * What is a genuine assumption is how many teams each region sends. Four is
 * the long-standing AHSAA rule; QUALIFIERS_PER_REGION is the one place to
 * change it.
 */
import { officialWinner } from "./result";
import {
  CLS_FILTER_ORDER,
  type Classification,
  type Game,
  type RatingRow,
} from "./types";

/** How many teams each region sends to the playoffs. */
export const QUALIFIERS_PER_REGION = 4;

/**
 * Rating points over which a gap becomes a near-certainty.
 *
 * Fitted out of sample on the 2025 season, per engine, by
 * scripts/calibrate-odds.ts. The two land close enough that the difference
 * does not matter much, but they are kept apart because the engines'
 * ratings are on slightly different spreads.
 */
export const WIN_SCALE = { classic: 7.85, twoway: 7.65 } as const;

/**
 * First-round region pods.
 *
 * Read off the 2025 playoffs rather than assumed. Every eight-region
 * classification paired 1-2, 3-4, 5-6 and 7-8 in the first round — 95 of the
 * 96 games played, the 96th missing from the export. The one four-region
 * class that season (7A) crossed instead, 1-4 and 2-3, in all eight of its
 * first-round games.
 */
export function podsFor(regions: number): [number, number][] {
  if (regions === 4) return [[1, 4], [2, 3]];
  const out: [number, number][] = [];
  for (let r = 1; r + 1 <= regions; r += 2) out.push([r, r + 1]);
  return out;
}

/**
 * Round names, counted back from the final.
 *
 * A class with four regions plays one round fewer than a class with eight, so
 * naming forward from "First Round" would call its championship a semifinal.
 * The last round is always the championship, whatever the bracket's size.
 */
const FROM_THE_END = [
  "Championship",
  "Semifinals",
  "Quarterfinals",
  "Second Round",
  "First Round",
];

export function roundNames(rounds: number): string[] {
  const out: string[] = [];
  for (let i = rounds - 1; i >= 0; i--) {
    out.push(FROM_THE_END[Math.min(i, FROM_THE_END.length - 1)]);
  }
  return out;
}

export interface TeamOdds {
  slug: string;
  name: string;
  classification: Classification;
  region: number;
  /** Region record as it stands, before any simulation. */
  region_w: number;
  region_l: number;
  /** Share of simulated seasons in which the team reaches the playoffs. */
  playoff: number;
  /** Share finishing 1st, 2nd, 3rd and 4th in its region. */
  seeds: number[];
  /** Share winning each round, in bracket order. Last entry is the title. */
  rounds: number[];
  /** Proved, not simulated: cannot miss / cannot reach the playoffs. */
  clinched: boolean;
  eliminated: boolean;
}

export interface ClassOdds {
  classification: Classification;
  regions: number;
  qualifiers: number;
  roundNames: string[];
  teams: TeamOdds[];
}

export interface OddsReport {
  generated: string;
  trials: number;
  scale: number;
  /** Regular-season games still to be played that the simulation decided. */
  remaining: number;
  classes: ClassOdds[];
}

/** Deterministic RNG, so republishing the same data gives the same page. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** A region game: same classification, same region, regular season. */
function isRegionGame(
  g: Pick<Game, "t1" | "t2" | "type">,
  meta: Map<string, { c: Classification; r: number }>,
): boolean {
  if (g.type === "playoff") return false;
  const a = meta.get(g.t1);
  const b = meta.get(g.t2);
  return Boolean(a && b && a.c === b.c && a.r === b.r);
}

/**
 * What each team's region record can still become.
 *
 * The floor is the wins it already has; the ceiling is those plus every region
 * game it has left. Both are certainties rather than estimates, which is what
 * makes them usable for a claim as strong as "eliminated".
 */
function standingsBounds(
  names: string[],
  played: Map<string, { w: number; l: number }>,
  left: Map<string, number>,
): Map<string, { min: number; max: number }> {
  const out = new Map<string, { min: number; max: number }>();
  for (const n of names) {
    const p = played.get(n) ?? { w: 0, l: 0 };
    out.set(n, { min: p.w, max: p.w + (left.get(n) ?? 0) });
  }
  return out;
}

export function computeOdds(
  ratings: RatingRow[],
  games: Game[],
  opts: {
    trials?: number;
    scale?: number;
    hfa?: number;
    qualifiers?: number;
    seed?: number;
  } = {},
): OddsReport {
  const trials = opts.trials ?? 10000;
  const scale = opts.scale ?? WIN_SCALE.classic;
  const hfa = opts.hfa ?? 2;
  const qualifiers = opts.qualifiers ?? QUALIFIERS_PER_REGION;
  const rnd = mulberry32(opts.seed ?? 20260826);

  const meta = new Map<string, { c: Classification; r: number }>();
  const rating = new Map<string, number>();
  for (const t of ratings) {
    meta.set(t.name, { c: t.classification as Classification, r: t.region });
    rating.set(t.name, t.rating);
  }

  let remainingTotal = 0;
  const classes: ClassOdds[] = [];

  for (const cls of CLS_FILTER_ORDER) {
    const field = ratings.filter((r) => r.classification === cls);
    if (!field.length) continue;

    const regions = Math.max(...field.map((t) => t.region));
    const pods = podsFor(regions);
    if (!pods.length) continue;
    const bracketSize = pods.length * 2 * qualifiers;
    const rounds = Math.round(Math.log2(bracketSize));

    // Region games involving this class, split into settled and outstanding.
    const settled = new Map<string, { w: number; l: number }>();
    const left: { t1: string; t2: string; neutral: boolean }[] = [];
    const leftCount = new Map<string, number>();
    for (const t of field) {
      settled.set(t.name, { w: 0, l: 0 });
      leftCount.set(t.name, 0);
    }

    for (const g of games) {
      if (!isRegionGame(g, meta)) continue;
      if (meta.get(g.t1)?.c !== cls) continue;
      const winner = officialWinner(g);
      const decided = g.s1 !== null && g.s2 !== null;
      if (decided || g.forfeit_by) {
        if (!winner) continue; // a tie changes neither record
        const w = settled.get(winner === "t1" ? g.t1 : g.t2);
        const l = settled.get(winner === "t1" ? g.t2 : g.t1);
        if (w) w.w++;
        if (l) l.l++;
      } else {
        left.push({ t1: g.t1, t2: g.t2, neutral: Boolean(g.neutral_site) });
        leftCount.set(g.t1, (leftCount.get(g.t1) ?? 0) + 1);
        leftCount.set(g.t2, (leftCount.get(g.t2) ?? 0) + 1);
      }
    }
    remainingTotal += left.length;

    // Teams grouped by region, and the head-to-head results already on file.
    const byRegion = new Map<number, string[]>();
    for (const t of field) {
      const list = byRegion.get(t.region) ?? [];
      list.push(t.name);
      byRegion.set(t.region, list);
    }

    const names = field.map((t) => t.name);
    const idx = new Map(names.map((n, i) => [n, i]));
    const bounds = standingsBounds(names, settled, leftCount);

    // Tallies.
    const madePlayoffs = new Int32Array(names.length);
    const seedHits = Array.from({ length: 4 }, () => new Int32Array(names.length));
    const roundHits = Array.from({ length: rounds }, () => new Int32Array(names.length));

    // Head-to-head, so a tie in the region table is broken the way the
    // association breaks it rather than by rating. Keyed "winner|loser".
    const h2h = new Set<string>();
    for (const g of games) {
      if (!isRegionGame(g, meta)) continue;
      const w = officialWinner(g);
      if (!w) continue;
      h2h.add(w === "t1" ? `${g.t1}|${g.t2}` : `${g.t2}|${g.t1}`);
    }

    const simW = new Int32Array(names.length);
    const simL = new Int32Array(names.length);
    const trialH2H = new Set<string>();

    for (let trial = 0; trial < trials; trial++) {
      simW.fill(0);
      simL.fill(0);
      trialH2H.clear();
      for (const n of names) {
        const s = settled.get(n)!;
        simW[idx.get(n)!] = s.w;
        simL[idx.get(n)!] = s.l;
      }

      // 1. Play out the region schedule.
      for (const g of left) {
        const ra = rating.get(g.t1) ?? 0;
        const rb = rating.get(g.t2) ?? 0;
        const edge = ra - rb + (g.neutral ? 0 : hfa);
        const homeWins = rnd() < sigmoid(edge / scale);
        const w = homeWins ? g.t1 : g.t2;
        const l = homeWins ? g.t2 : g.t1;
        simW[idx.get(w)!]++;
        simL[idx.get(l)!]++;
        trialH2H.add(`${w}|${l}`);
      }

      // 2. Seed each region.
      const seeded: string[][] = [];
      for (let r = 1; r <= regions; r++) {
        const list = (byRegion.get(r) ?? []).slice().sort((a, b) => {
          const ia = idx.get(a)!;
          const ib = idx.get(b)!;
          const pa = simW[ia] + simL[ia] ? simW[ia] / (simW[ia] + simL[ia]) : 0;
          const pb = simW[ib] + simL[ib] ? simW[ib] / (simW[ib] + simL[ib]) : 0;
          if (pa !== pb) return pb - pa;
          if (simW[ia] !== simW[ib]) return simW[ib] - simW[ia];
          // Head-to-head, this season's result or the one just simulated.
          const aBeatB = h2h.has(`${a}|${b}`) || trialH2H.has(`${a}|${b}`);
          const bBeatA = h2h.has(`${b}|${a}`) || trialH2H.has(`${b}|${a}`);
          if (aBeatB !== bBeatA) return aBeatB ? -1 : 1;
          return (rating.get(b) ?? 0) - (rating.get(a) ?? 0);
        });
        seeded.push(list.slice(0, qualifiers));
      }

      // 3. Build the first round and play the bracket out.
      let slots: string[] = [];
      for (let p = 0; p < pods.length; p += 2) {
        const P = podGames(seeded, pods[p], qualifiers);
        const Q = pods[p + 1] ? podGames(seeded, pods[p + 1], qualifiers) : null;
        if (!Q) {
          // A single pod (two regions) is a straight bracket of its own.
          for (const m of P) slots.push(m[0], m[1]);
          continue;
        }
        // Interleaved so the ordinary adjacent-pair advancement below sends
        // each pod's winners across to the other pod, which is what the 2025
        // second rounds did in every class.
        for (let i = 0; i < P.length; i++) {
          const q = Q[Q.length - 1 - i];
          slots.push(P[i][0], P[i][1], q[0], q[1]);
        }
      }

      for (const n of seeded.flat()) madePlayoffs[idx.get(n)!]++;
      for (let r = 1; r <= regions; r++) {
        const list = seeded[r - 1];
        for (let s = 0; s < list.length && s < 4; s++) {
          seedHits[s][idx.get(list[s])!]++;
        }
      }

      let alive = slots;
      for (let round = 0; round < rounds; round++) {
        const next: string[] = [];
        for (let i = 0; i + 1 < alive.length; i += 2) {
          const a = alive[i];
          const b = alive[i + 1];
          if (!a && !b) continue;
          if (!a || !b) {
            next.push(a || b);
            continue;
          }
          // The better seed hosts. Seeds are not tracked through the bracket,
          // so the higher-rated side is used as the stand-in for who is at
          // home — which is what seeding is trying to approximate anyway.
          const ra = rating.get(a) ?? 0;
          const rb = rating.get(b) ?? 0;
          const edge = ra - rb + (ra >= rb ? hfa : -hfa);
          const aWins = rnd() < sigmoid(edge / scale);
          const w = aWins ? a : b;
          next.push(w);
          roundHits[round][idx.get(w)!]++;
        }
        alive = next;
      }
    }

    // A region with no games left has a final table, whatever the win-loss
    // bounds can prove about it — the tiebreakers have already decided, and
    // the simulation is deterministic. Without this a team reading 100% would
    // still not be called clinched on the last weekend of the season.
    const regionSettled = new Map<number, boolean>();
    for (let r = 1; r <= regions; r++) {
      regionSettled.set(
        r,
        !(byRegion.get(r) ?? []).some((n) => (leftCount.get(n) ?? 0) > 0),
      );
    }

    // 4. Proofs, separate from the simulation.
    const teams: TeamOdds[] = field.map((t) => {
      const i = idx.get(t.name)!;
      const mine = bounds.get(t.name)!;
      const rivals = (byRegion.get(t.region) ?? []).filter((n) => n !== t.name);
      // Certain to finish above me: their worst beats my best.
      const above = rivals.filter((n) => bounds.get(n)!.min > mine.max).length;
      // Certain to finish below me: my worst beats their best.
      const below = rivals.filter((n) => bounds.get(n)!.max < mine.min).length;
      const done = regionSettled.get(t.region) === true;
      const share = madePlayoffs[i] / trials;
      const s = settled.get(t.name)!;
      return {
        slug: t.slug,
        name: t.name,
        classification: t.classification as Classification,
        region: t.region,
        region_w: s.w,
        region_l: s.l,
        playoff: share,
        seeds: seedHits.map((a) => a[i] / trials),
        rounds: roundHits.map((a) => a[i] / trials),
        clinched: done ? share === 1 : rivals.length - below < qualifiers,
        eliminated: done ? share === 0 : above >= qualifiers,
      };
    });

    teams.sort(
      (a, b) =>
        b.playoff - a.playoff ||
        (b.rounds.at(-1) ?? 0) - (a.rounds.at(-1) ?? 0) ||
        a.name.localeCompare(b.name),
    );

    classes.push({
      classification: cls,
      regions,
      qualifiers,
      roundNames: roundNames(rounds),
      teams,
    });
  }

  return {
    generated: new Date().toISOString(),
    trials,
    scale,
    remaining: remainingTotal,
    classes,
  };
}

/**
 * The four first-round games inside one pod of two regions.
 *
 * The champion of each hosts the other's fourth seed, and the runner-up hosts
 * the other's third — the pairing the AHSAA has used for years, and the one
 * every eight-region class followed in 2025.
 */
function podGames(
  seeded: string[][],
  pod: [number, number],
  qualifiers: number,
): [string, string][] {
  const A = seeded[pod[0] - 1] ?? [];
  const B = seeded[pod[1] - 1] ?? [];
  const at = (list: string[], seed: number) => list[seed - 1] ?? "";
  const worst = qualifiers; // 4th seed in the usual format
  const second = Math.min(2, qualifiers);
  const third = Math.min(3, qualifiers);
  return [
    [at(A, 1), at(B, worst)],
    [at(B, second), at(A, third)],
    [at(B, 1), at(A, worst)],
    [at(A, second), at(B, third)],
  ];
}
