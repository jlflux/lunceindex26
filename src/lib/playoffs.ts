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
 * How many teams each region sends is not derived from anything — it is told
 * to us, and it differs by classification. See QUALIFIERS.
 */
import { officialWinner } from "./result";
import { orderRegion, type TieContext } from "./tiebreak";
import {
  CLS_FILTER_ORDER,
  CLS_ORDER,
  type Classification,
  type Game,
  type RatingRow,
} from "./types";

/**
 * How many teams each region sends to the playoffs, by classification.
 *
 * Not a single number: 6A sends six from each of its four regions, and AA
 * sends every team in both of its, which makes its bracket a seeding exercise
 * rather than a qualification one. Everything else sends four.
 *
 * This is the one part of the format that is told to us rather than derived
 * from a previous season, so it is a table on its own and the only thing to
 * edit if the association changes it.
 */
export const QUALIFIERS: Record<string, number> = {
  "6A": 6,
  "5A": 4,
  "4A": 4,
  "3A": 4,
  "2A": 4,
  "1A": 4,
  AA: 8,
  A: 4,
};

/** Fallback for a classification the table does not name. */
export const QUALIFIERS_DEFAULT = 4;

export function qualifiersFor(cls: string, size?: number): number {
  const q = QUALIFIERS[cls] ?? QUALIFIERS_DEFAULT;
  // Never ask for more teams than a region holds.
  return size ? Math.min(q, size) : q;
}

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
  /**
   * Mean region record across the simulated seasons — where this team is
   * heading rather than where it is. The analogue of a projected points total,
   * and what the region groups are ordered by.
   */
  proj_w: number;
  proj_l: number;
  /** Share of simulated seasons in which the team reaches the playoffs. */
  playoff: number;
  /** Share finishing on each qualifying seed, 1st first. Length varies by class. */
  seeds: number[];
  /** Share winning each round, in bracket order. Last entry is the title. */
  rounds: number[];
  /** Proved, not simulated: cannot miss / cannot reach the playoffs. */
  clinched: boolean;
  eliminated: boolean;
  /**
   * The team's region has no games left, so its finishing place is settled
   * and its seed is a fact rather than a forecast. What lets the page print
   * a flat 100% instead of ">99%".
   */
  settled: boolean;
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
    /** Overrides the per-classification table. Tests use it. */
    qualifiers?: number;
    seed?: number;
  } = {},
): OddsReport {
  const trials = opts.trials ?? 10000;
  const scale = opts.scale ?? WIN_SCALE.classic;
  const hfa = opts.hfa ?? 2;
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
    // Smallest region in the class caps it: a region cannot send more teams
    // than it holds.
    const smallest = Math.min(
      ...Array.from({ length: regions }, (_, i) =>
        field.filter((t) => t.region === i + 1).length,
      ).filter((n) => n > 0),
    );
    const qualifiers = opts.qualifiers ?? qualifiersFor(cls, smallest);
    const bracketSize = pods.length * podSize(qualifiers);
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
    const sumW = new Float64Array(names.length);
    const sumL = new Float64Array(names.length);
    // One counter per qualifying place, not a fixed four — 6A seeds six and
    // AA seeds eight.
    const seedHits = Array.from(
      { length: qualifiers },
      () => new Int32Array(names.length),
    );
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

    // Everything the association's later factors reach for. Region results
    // change every trial; nothing else does, so the rest is built once.
    //
    // Two approximations live here, and both are confined to factors (k)
    // through (p) — the ones reached only after head-to-head and eight
    // ranked-team comparisons have all failed to separate anybody, which is
    // to say almost never. Non-region games are not simulated at all, because
    // they have no bearing on a region table, so a team's non-region record
    // is the one it holds today. And an opponent's victory total is its
    // current one, not the one it would finish that simulated season with.
    const nonRegion = new Map<string, { opponent: string; won: boolean }[]>();
    const regionFixtures = new Map<string, string[]>();
    for (const t of field) {
      nonRegion.set(t.name, []);
      regionFixtures.set(t.name, []);
    }
    for (const g of games) {
      const a = meta.get(g.t1);
      const b = meta.get(g.t2);
      if (a?.c !== cls && b?.c !== cls) continue;
      if (g.type === "playoff") continue;
      if (isRegionGame(g, meta)) {
        if (a?.c !== cls) continue;
        regionFixtures.get(g.t1)?.push(g.t2);
        regionFixtures.get(g.t2)?.push(g.t1);
        continue;
      }
      const w = officialWinner(g);
      if (!w) continue;
      nonRegion.get(g.t1)?.push({ opponent: g.t2, won: w === "t1" });
      nonRegion.get(g.t2)?.push({ opponent: g.t1, won: w === "t2" });
    }

    // Wins outside the region are fixed; wins inside it are this trial's.
    const nonRegionWins = new Map<string, number>();
    for (const t of field) {
      nonRegionWins.set(
        t.name,
        (nonRegion.get(t.name) ?? []).filter((g) => g.won).length,
      );
    }

    const classOrderOf = (n: string) => {
      const m = meta.get(n);
      return m ? (CLS_ORDER[m.c] ?? null) : null;
    };
    const beatIn = (a: string, b: string) =>
      h2h.has(`${a}|${b}`) || trialH2H.has(`${a}|${b}`);

    const makeCtx = (
      teamAtPlace: (place: number) => string | null,
    ): TieContext => ({
      beat: beatIn,
      // Every region fixture is either played or simulated, so a pairing on
      // the schedule has always met by the time the seeds are read.
      metRequired: (a, b) => (regionFixtures.get(a) ?? []).includes(b),
      teamAtPlace,
      results: (t) => [
        ...(nonRegion.get(t) ?? []).map((g) => ({ ...g, required: false })),
        ...(regionFixtures.get(t) ?? []).map((o) => ({
          opponent: o,
          won: beatIn(t, o),
          required: true,
        })),
      ],
      victories: (t) =>
        (nonRegionWins.get(t) ?? 0) + simW[idx.get(t) as number],
      classOrder: classOrderOf,
      rating: (n) => rating.get(n) ?? 0,
    });

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

      // 2. Seed each region, by the same chain the standings page uses.
      const seeded: string[][] = [];
      for (let r = 1; r <= regions; r++) {
        const list = orderRegion(
          byRegion.get(r) ?? [],
          (name) => {
            const i = idx.get(name) as number;
            return { wins: simW[i], losses: simL[i] };
          },
          makeCtx,
        );
        seeded.push(list.slice(0, qualifiers));
      }

      // 3. Build the first round and play the bracket out.
      const slots: string[] = [];
      for (let p = 0; p < pods.length; p += 2) {
        const P = podBracket(seeded, pods[p], qualifiers);
        const Q = pods[p + 1]
          ? podBracket(seeded, pods[p + 1], qualifiers)
          : null;
        if (!Q) {
          // A single pod is a straight bracket of its own.
          slots.push(...P);
          continue;
        }
        // Interleaved a game at a time, so the ordinary adjacent-pair
        // advancement below sends each pod's winners across to the other pod
        // — which is what the 2025 second rounds did in every class. Q is
        // taken from its far end so the two pods' top seeds stay apart.
        for (let i = 0; i < P.length; i += 2) {
          const j = Q.length - 2 - i;
          slots.push(P[i], P[i + 1], Q[j], Q[j + 1]);
        }
      }

      for (let i = 0; i < names.length; i++) {
        sumW[i] += simW[i];
        sumL[i] += simL[i];
      }
      for (const n of seeded.flat()) madePlayoffs[idx.get(n)!]++;
      for (let r = 1; r <= regions; r++) {
        const list = seeded[r - 1];
        for (let s = 0; s < list.length && s < qualifiers; s++) {
          seedHits[s][idx.get(list[s])!]++;
        }
      }

          let alive: string[] = slots;
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
        proj_w: sumW[i] / trials,
        proj_l: sumL[i] / trials,
        playoff: share,
        seeds: seedHits.map((a) => a[i] / trials),
        rounds: roundHits.map((a) => a[i] / trials),
        clinched: done ? share === 1 : rivals.length - below < qualifiers,
        eliminated: done ? share === 0 : above >= qualifiers,
        settled: done,
      };
    });

    // Grouped by region on the page, so sort by region first and then by
    // where each team is heading — projected record, with the odds breaking
    // ties. That ordering is what the playoff cut line is drawn against.
    teams.sort(
      (a, b) =>
        a.region - b.region ||
        b.proj_w - a.proj_w ||
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
 * Standard bracket order: which seed sits in which slot, for a field of `m`.
 *
 * m=4 gives [1,4,2,3]; m=8 gives [1,8,4,5,2,7,3,6]. Built by the usual
 * doubling rule, so the top seed meets the bottom one and the two best are
 * kept apart until the final.
 */
export function seedSlots(m: number): number[] {
  let arr = [1];
  while (arr.length < m) {
    const n = arr.length * 2;
    const next: number[] = [];
    for (const seed of arr) next.push(seed, n + 1 - seed);
    arr = next;
  }
  return arr;
}

/**
 * One pod's first round: two regions' qualifiers, laid into a bracket.
 *
 * The pod is seeded by alternating the regions — each region's champion, then
 * each runner-up, and so on — and then dropped into the standard bracket order
 * above. With four from each region that reproduces the AHSAA pairing exactly:
 * A1-B4, B2-A3, B1-A4, A2-B3, which is what all six eight-region classes did
 * in 2025. It was not built to match; it falls out of ordinary bracket
 * seeding, which is a reason to trust it for the sizes there is no precedent
 * for.
 *
 * When the field is not a power of two the empty slots land against the top
 * seeds, which is what a bye is. 6A sending six from each region gives a pod
 * of twelve in a bracket of sixteen, so each region's champion and runner-up
 * sit out the first round.
 */
export function podBracket(
  seeded: string[][],
  pod: [number, number],
  qualifiers: number,
): string[] {
  const A = seeded[pod[0] - 1] ?? [];
  const B = seeded[pod[1] - 1] ?? [];
  // Pod seed order: A1, B1, A2, B2, …
  const order: string[] = [];
  for (let i = 0; i < qualifiers; i++) {
    order.push(A[i] ?? "", B[i] ?? "");
  }
  const m = podSize(qualifiers);
  return seedSlots(m).map((seed) => order[seed - 1] ?? "");
}

/** Bracket size for one pod: the field rounded up to a power of two. */
export function podSize(qualifiers: number): number {
  return Math.pow(2, Math.ceil(Math.log2(Math.max(2, qualifiers * 2))));
}
