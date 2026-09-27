/**
 * Turning a stored bracket into a drawn one.
 *
 * Two steps, and the join between them is a seed rather than a team.
 *
 *   1. `seededRegions` orders every region — by the AHSAA procedure the
 *      standings and the odds already share, unless a region has been pinned
 *      by hand — and attaches each team's record and status.
 *   2. `resolveBracket` walks the stored slots, asks step 1 who holds each
 *      seed, and advances winners up the tree.
 *
 * Because the stored bracket names no team, a re-seed flows through it without
 * anything being edited. That is what makes the hand-made arrangement carried
 * over from the old site survive a season of results: it was never a statement
 * about who plays whom, only about which places meet.
 *
 * The output is plain data all the way down — no closures — so a server
 * component can resolve once and hand the result to a client component to
 * draw.
 */
import type {
  BracketState,
  ClassState,
  GameEditorial,
  SeedRef,
  Slot,
  StatusKey,
} from "./bracket-types";
import { isPlayed, officialWinner } from "./result";
import { QUALIFIERS, roundNames, type OddsReport } from "./playoffs";
import { regionRecords, tieDataFor, orderRegionStandings } from "./season";
import type { Record2 } from "./season";
import { CLS_FILTER_ORDER, type Classification, type Game, type RatingRow } from "./types";

/* ------------------------------------------------------------------ seeds */

export type SeededTeam = {
  name: string;
  slug: string;
  /** 1-based place within the region. */
  place: number;
  /** Overall record, which counts every game the team played. */
  wins: number;
  losses: number;
  /** Region record, which does not count games against a barred team. */
  region_w: number;
  region_l: number;
  region_t: number;
  status: StatusKey;
  /** Share of simulated seasons reaching the playoffs, when odds are loaded. */
  playoff: number | null;
  /** Inside this region's allocation of places. */
  qualifies: boolean;
  ineligible: boolean;
};

/** Where a status comes from when nobody has overridden it. */
export const STATUS_CUTOFFS = { high: 0.75, medium: 0.4 } as const;

/**
 * A team's status from its odds.
 *
 * `clinched` and `eliminated` are proofs rather than counts — they come from
 * what the remaining games make arithmetically possible — so they are taken
 * as given. The middle three are a reading of a probability, and the cutoffs
 * are a judgement rather than a fact. They live here so there is one place to
 * argue with.
 */
export function statusFromOdds(o: {
  clinched: boolean;
  eliminated: boolean;
  ineligible: boolean;
  playoff: number;
}): StatusKey {
  if (o.ineligible) return "ineligible";
  if (o.clinched) return "clinched";
  if (o.eliminated) return "out";
  if (o.playoff >= STATUS_CUTOFFS.high) return "high";
  if (o.playoff >= STATUS_CUTOFFS.medium) return "medium";
  return "low";
}

/** Without odds — a fallback good enough to render before the first publish. */
function statusFromRecord(r: Record2, qualifying: boolean): StatusKey {
  const played = r.wins + r.losses + r.ties;
  if (!played) return "medium";
  return qualifying ? "high" : "low";
}

export const regionKey = (c: Classification, r: number) => `${c}:${r}`;

/**
 * How many places a region sends.
 *
 * `QUALIFIERS` is told to us rather than derived, and a region cannot send
 * more teams than it has eligible to go.
 */
export function placesFor(c: Classification, eligible: number): number {
  return Math.min(QUALIFIERS[c] ?? 4, Math.max(eligible, 1));
}

/**
 * Every region, ordered and annotated.
 *
 * The ordering is `orderRegionStandings`, which is the association's own
 * procedure and is the same call the standings page makes — so the bracket
 * cannot disagree with the standings about who holds a place. A pinned order
 * replaces it wholesale for that region; names that do not match the roster
 * are ignored rather than dropped, and anyone left out keeps their computed
 * order behind the pinned ones.
 */
export function seededRegions(
  ratings: RatingRow[],
  games: Game[],
  odds: OddsReport | undefined,
  state: BracketState,
): Map<string, SeededTeam[]> {
  const reg = regionRecords(ratings, games);
  const tie = tieDataFor(ratings, games);

  const byName = new Map<
    string,
    { clinched: boolean; eliminated: boolean; ineligible: boolean; playoff: number }
  >();
  for (const c of odds?.classes ?? []) {
    for (const t of c.teams) {
      byName.set(t.name, {
        clinched: t.clinched,
        eliminated: t.eliminated,
        ineligible: t.ineligible,
        playoff: t.playoff,
      });
    }
  }

  const out = new Map<string, SeededTeam[]>();

  for (const cls of CLS_FILTER_ORDER) {
    const field = ratings.filter((t) => t.classification === cls);
    if (!field.length) continue;
    const regions = Math.max(...field.map((t) => t.region));

    for (let r = 1; r <= regions; r++) {
      const list = field.filter((t) => t.region === r);
      if (!list.length) continue;

      let ordered = orderRegionStandings(list, reg, tie);

      const pinned = state.classes[cls]?.regions?.[String(r)]?.order;
      if (pinned?.length) ordered = applyPinnedOrder(ordered, pinned);

      const overrides = state.classes[cls]?.regions?.[String(r)]?.status ?? {};

      // Built without places, then numbered by `assignPlaces` — the same call
      // the admin makes when a drag reorders a region, so what the editor
      // shows while you are dragging is what gets published.
      const rows: SeededTeam[] = ordered.map((t) => {
        const record = reg.get(t.name) ?? { wins: 0, losses: 0, ties: 0 };
        const ineligible = t.postseason_ineligible === true;
        const o = byName.get(t.name);
        return {
          name: t.name,
          slug: t.slug,
          place: 0,
          wins: t.wins,
          losses: t.losses,
          region_w: record.wins,
          region_l: record.losses,
          region_t: record.ties,
          // Status does not depend on where in the region a team sits, with
          // one exception: without odds loaded there is nothing to read but
          // the record, and then "is it in a place" is the only signal there
          // is. `assignPlaces` fills that in afterwards.
          status: overrides[t.name] ?? (o ? statusFromOdds(o) : "medium"),
          playoff: o ? o.playoff : null,
          qualifies: false,
          ineligible,
        };
      });

      out.set(
        regionKey(cls, r),
        assignPlaces(cls, rows, {
          // Only where the odds have not been published yet.
          fallbackStatus: !byName.size,
          overrides,
        }),
      );
    }
  }

  return out;
}

/**
 * Numbers a region: first place, second place, and who is inside the
 * allocation.
 *
 * Pulled out of `seededRegions` so the admin can call it too. The editor
 * reorders a region locally on every drag and has to renumber it the same way
 * the server would, or the places shown while dragging are not the places that
 * get published — and a second copy of "barred teams do not consume a place"
 * is exactly the kind of duplication that has already bitten this codebase
 * twice.
 */
export function assignPlaces(
  cls: Classification,
  ordered: SeededTeam[],
  opts: {
    /** Recompute status from the record, for boards with no odds yet. */
    fallbackStatus?: boolean;
    overrides?: Record<string, StatusKey>;
  } = {},
): SeededTeam[] {
  const eligible = ordered.filter((t) => !t.ineligible).length;
  const places = placesFor(cls, eligible);

  let place = 0;
  return ordered.map((t) => {
    // A barred team occupies no place, so it does not consume one.
    if (!t.ineligible) place++;
    const qualifies = !t.ineligible && place <= places;
    const status: StatusKey = t.ineligible
      ? "ineligible"
      : (opts.overrides?.[t.name] ??
        (opts.fallbackStatus
          ? statusFromRecord(
              { wins: t.region_w, losses: t.region_l, ties: t.region_t },
              qualifies,
            )
          : t.status));
    return {
      ...t,
      place: t.ineligible ? 0 : place,
      qualifies,
      status,
    };
  });
}

/**
 * Reorders a region to a hand-pinned list.
 *
 * Forgiving on purpose. A pinned name that is not in the region — a team
 * renamed, reclassified, or simply mistyped — is skipped rather than allowed
 * to blank a place, and any team the list forgets keeps its computed order
 * behind the ones it names. A pin should never be able to empty a bracket.
 */
export function applyPinnedOrder<T extends { name: string }>(
  computed: T[],
  pinned: string[],
): T[] {
  const by = new Map(computed.map((t) => [t.name, t]));
  const seen = new Set<string>();
  const head: T[] = [];
  for (const name of pinned) {
    const t = by.get(name);
    if (!t || seen.has(name)) continue;
    seen.add(name);
    head.push(t);
  }
  return [...head, ...computed.filter((t) => !seen.has(t.name))];
}

/* --------------------------------------------------------------- the tree */

type SlotSource = { kind: "leaf"; ref: Slot } | { kind: "game"; ref: string };

export type BracketNode = {
  id: string;
  round: number;
  top: SlotSource;
  bottom: SlotSource;
};

/**
 * Pairs a flat list of first-round slots into a tree, then pairs the winners,
 * until one game is left.
 *
 * Game ids are positional — `r2g0` is the first game of the second round — so
 * they are stable only while the bracket is the same size. Anything stored
 * against them (a kickoff time, a projected winner) has to be dropped if the
 * slot count changes, or it lands on a different match-up. `sizeOf` is what
 * the admin checks before it lets that happen.
 */
export function buildTree(slots: Slot[]): BracketNode[][] {
  const rounds: BracketNode[][] = [];
  let nodes: BracketNode[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    nodes.push({
      id: `r1g${i / 2}`,
      round: 1,
      top: { kind: "leaf", ref: slots[i] ?? null },
      bottom: { kind: "leaf", ref: slots[i + 1] ?? null },
    });
  }
  if (!nodes.length) return [];
  rounds.push(nodes);

  let r = 2;
  while (nodes.length > 1) {
    const next: BracketNode[] = [];
    for (let i = 0; i < nodes.length; i += 2) {
      next.push({
        id: `r${r}g${i / 2}`,
        round: r,
        top: { kind: "game", ref: nodes[i].id },
        bottom: { kind: "game", ref: nodes[i + 1].id },
      });
    }
    rounds.push(next);
    nodes = next;
    r++;
  }
  return rounds;
}

/* ------------------------------------------------------------- resolution */

export type ResolvedSlot = {
  /** "R4-2", or null for a bye or an undecided winner. */
  seed: string | null;
  team: string | null;
  slug: string | null;
  record: string | null;
  score: number | null;
  home: boolean;
  bye: boolean;
  winner: boolean;
  loser: boolean;
  /** Here because someone projected it, not because it was played. */
  projected: boolean;
};

export type ResolvedGame = {
  id: string;
  round: number;
  top: ResolvedSlot;
  bottom: ResolvedSlot;
  /** A real result decided this, so a projection cannot move it. */
  locked: boolean;
  date: string;
  time: string;
  location: string;
  note: string;
};

export type ResolvedBracket = {
  classification: Classification;
  rounds: ResolvedGame[][];
  roundNames: string[];
  /** The team that came out of the final, if it is decided. */
  champion: ResolvedSlot | null;
  /** Slots that name a place no team holds — a mis-sized region. */
  unresolved: string[];
};

type Participant =
  | { kind: "bye" }
  | { kind: "team"; team: SeededTeam; ref: SeedRef; projected: boolean }
  | { kind: "empty"; ref: SeedRef }
  | null;

const blankSlot = (): ResolvedSlot => ({
  seed: null,
  team: null,
  slug: null,
  record: null,
  score: null,
  home: false,
  bye: false,
  winner: false,
  loser: false,
  projected: false,
});

export const seedLabel = (ref: SeedRef) => `R${ref.region}-${ref.place}`;

/**
 * Playoff games already on file, indexed by the pair of teams in them.
 *
 * The bracket takes its scores from the games table rather than keeping its
 * own, so a playoff result is entered once and counts for both the ratings and
 * the bracket. Keyed unordered, because which side of the row a team sits on
 * has nothing to do with which half of the bracket it is drawn in.
 */
function playoffIndex(games: Game[]): Map<string, Game> {
  const out = new Map<string, Game>();
  for (const g of games) {
    if (g.type !== "playoff") continue;
    out.set([g.t1, g.t2].sort().join("|"), g);
  }
  return out;
}

export function resolveBracket(
  state: BracketState,
  cls: Classification,
  seeded: Map<string, SeededTeam[]>,
  games: Game[],
  opts: { projected?: boolean } = {},
): ResolvedBracket | null {
  const cs = state.classes[cls];
  if (!cs?.slots?.length) return null;

  const projected = opts.projected === true && state.showProjections;
  const rounds = buildTree(cs.slots);
  if (!rounds.length) return null;

  const byId = new Map<string, BracketNode>();
  for (const rnd of rounds) for (const g of rnd) byId.set(g.id, g);

  const played = playoffIndex(games);
  const unresolved: string[] = [];
  const memo = new Map<string, Participant>();

  const teamAt = (ref: SeedRef): SeededTeam | null =>
    (seeded.get(regionKey(cls, ref.region)) ?? []).find(
      (t) => t.place === ref.place,
    ) ?? null;

  function participant(src: SlotSource): Participant {
    if (src.kind === "leaf") {
      if (!src.ref) return { kind: "bye" };
      const team = teamAt(src.ref);
      if (!team) {
        const label = seedLabel(src.ref);
        if (!unresolved.includes(label)) unresolved.push(label);
        return { kind: "empty", ref: src.ref };
      }
      return { kind: "team", team, ref: src.ref, projected: false };
    }
    return winnerOf(src.ref);
  }

  /**
   * Who came out of a game.
   *
   * A bye short-circuits: the other side advances with nothing to play. A real
   * result always wins — even in projected mode, which is what "locked" means
   * on the board — and only then does a hand-picked projection apply.
   *
   * The memo is seeded with null before the walk so a bracket that somehow
   * refers to itself returns undecided rather than recursing forever.
   */
  function winnerOf(id: string): Participant {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    memo.set(id, null);

    const g = byId.get(id);
    if (!g) return null;

    const top = participant(g.top);
    const bot = participant(g.bottom);

    if (top?.kind === "bye" && (!bot || bot.kind === "bye")) return null;
    if (top?.kind === "bye") {
      memo.set(id, bot);
      return bot;
    }
    if (bot?.kind === "bye") {
      memo.set(id, top);
      return top;
    }

    const result = gameFor(top, bot);
    if (result) {
      const side = officialWinner(result);
      if (side) {
        const winnerName = side === "t1" ? result.t1 : result.t2;
        const w = nameOf(top) === winnerName ? top : bot;
        memo.set(id, w);
        return w;
      }
    }

    if (projected) {
      const pick = state.classes[cls]?.projected?.[id];
      if (pick === "top" && top) {
        const w = { ...top, projected: true } as Participant;
        memo.set(id, w);
        return w;
      }
      if (pick === "bottom" && bot) {
        const w = { ...bot, projected: true } as Participant;
        memo.set(id, w);
        return w;
      }
    }
    return null;
  }

  const nameOf = (p: Participant): string | null =>
    p?.kind === "team" ? p.team.name : null;

  function gameFor(a: Participant, b: Participant): Game | null {
    const x = nameOf(a);
    const y = nameOf(b);
    if (!x || !y) return null;
    const g = played.get([x, y].sort().join("|"));
    return g && isPlayed(g) ? g : null;
  }

  function draw(
    p: Participant,
    other: Participant,
    editorial: GameEditorial,
    side: "top" | "bottom",
    won: boolean,
    decided: boolean,
  ): ResolvedSlot {
    const slot = blankSlot();
    if (!p) return slot;
    if (p.kind === "bye") {
      slot.bye = true;
      return slot;
    }
    if (p.kind === "empty") {
      slot.seed = seedLabel(p.ref);
      return slot;
    }
    slot.seed = seedLabel(p.ref);
    slot.team = p.team.name;
    slot.slug = p.team.slug;
    slot.record = `${p.team.wins}-${p.team.losses}`;
    slot.home = editorial.home === side;
    slot.projected = p.projected;
    slot.winner = decided && won;
    slot.loser = decided && !won;

    const g = gameFor(p, other);
    if (g) {
      const mine = g.t1 === p.team.name ? g.s1 : g.s2;
      slot.score = mine;
    }
    return slot;
  }

  const drawn: ResolvedGame[][] = rounds.map((rnd) =>
    rnd.map((g) => {
      const top = participant(g.top);
      const bot = participant(g.bottom);
      const w = winnerOf(g.id);
      const editorial = state.classes[cls]?.results?.[g.id] ?? {};
      const byeGame = top?.kind === "bye" || bot?.kind === "bye";
      const decided = Boolean(w) && !byeGame;
      const real = gameFor(top, bot);
      const topWon = Boolean(w && nameOf(w) && nameOf(w) === nameOf(top));

      return {
        id: g.id,
        round: g.round,
        top: draw(top, bot, editorial, "top", topWon, decided),
        bottom: draw(bot, top, editorial, "bottom", !topWon, decided),
        locked: Boolean(real && officialWinner(real)),
        date: editorial.date ?? "",
        time: editorial.time ?? "",
        location: editorial.location ?? "",
        note: editorial.note ?? "",
      };
    }),
  );

  const finalId = rounds[rounds.length - 1]?.[0]?.id;
  const champ = finalId ? winnerOf(finalId) : null;

  return {
    classification: cls,
    rounds: drawn,
    roundNames: roundNames(rounds.length),
    champion:
      champ?.kind === "team"
        ? draw(champ, null, {}, "top", true, true)
        : null,
    unresolved,
  };
}

/* ------------------------------------------------------------- the shapes */

/**
 * The default first round for a classification that has none stored.
 *
 * Only ever a starting point. Every live class has a hand-arranged `slots`
 * array that differs from what these produce — 6A is laid out across regions
 * rather than by block, and AA overrides the cross-seeding outright — so the
 * importer carries the stored arrangement over verbatim and nothing
 * regenerates it.
 */
export function defaultSlots(cls: Classification, regions: number): Slot[] {
  const seed = (region: number, place: number): Slot => ({ region, place });

  /** Two regions cross-seeded into eight slots: a1-b4, a3-b2, a2-b3, a4-b1. */
  const pod = (a: number, b: number): Slot[] => [
    seed(a, 1), seed(b, 4),
    seed(a, 3), seed(b, 2),
    seed(a, 2), seed(b, 3),
    seed(a, 4), seed(b, 1),
  ];

  /** Two whole regions of eight, so the champions can only meet in the final. */
  const bigPod = (a: number, b: number): Slot[] => [
    seed(a, 1), seed(b, 8), seed(b, 4), seed(a, 5),
    seed(a, 3), seed(b, 6), seed(b, 2), seed(a, 7),
    seed(a, 2), seed(b, 7), seed(b, 3), seed(a, 6),
    seed(a, 4), seed(b, 5), seed(b, 1), seed(a, 8),
  ];

  /** One region of six into eight slots — the top two seeds take the byes. */
  const sixBlock = (r: number): Slot[] => [
    seed(r, 1), null,
    seed(r, 4), seed(r, 5),
    seed(r, 2), null,
    seed(r, 3), seed(r, 6),
  ];

  if (cls === "6A") {
    return Array.from({ length: Math.min(regions, 4) }, (_, i) =>
      sixBlock(i + 1),
    ).flat();
  }
  if (cls === "AA") return bigPod(1, 2);
  const pairs: Slot[][] = [];
  for (let a = 1; a + 1 <= regions; a += 2) pairs.push(pod(a, a + 1));
  return pairs.flat();
}

/** Slots in a bracket for this class, for the "did the shape change" check. */
export function sizeOf(state: BracketState, cls: Classification): number {
  return state.classes[cls]?.slots?.length ?? 0;
}

export function classStateOf(
  state: BracketState,
  cls: Classification,
): ClassState | null {
  return state.classes[cls] ?? null;
}
