/**
 * Season-shaped helpers: region records, and which week the season is on.
 *
 * Both are derived from the games rather than configured, so neither needs
 * touching when the calendar moves.
 */
import { officialWinner } from "./result";
import {
  orderRegion,
  type TieContext,
  type TieGame,
} from "./tiebreak";
import { CLS_ORDER, type Classification, type Game, type RatingRow } from "./types";

/** The key ScheduleBrowser uses to identify a week or a playoff round. */
export function weekKey(g: Pick<Game, "type" | "round" | "week">): string {
  return g.type === "playoff" ? `p:${g.round ?? "r0"}` : `r:${g.week}`;
}

/** Sort position of a week key: regular season in order, then the playoffs. */
export function weekOrder(k: string): number {
  return k.startsWith("p:") ? 100 + Number(k.slice(3) || 0) : Number(k.slice(2));
}

/**
 * Parses the two date shapes the AHSAA sheets produce.
 *
 * Most rows are ISO ("2026-09-11"), but a run of them arrive as "Sep. 4, 2026"
 * depending on which sheet they came from. Returns a UTC midnight timestamp so
 * arithmetic on it cannot be shifted by the server's own zone.
 */
export function parseGameDate(raw: string | null): Date | null {
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (iso) {
    return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  }
  const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
  const m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(raw.trim());
  if (m) {
    const mi = MONTHS.indexOf(m[1].toLowerCase());
    if (mi >= 0) return new Date(Date.UTC(+m[3], mi, +m[2]));
  }
  return null;
}

/** Today's date in Alabama, as a UTC-midnight Date for comparison. */
export function todayInAlabama(now: Date = new Date()): Date {
  // Going through the formatter rather than a fixed offset so the answer is
  // right on both sides of the daylight-saving change.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, mo, d] = parts.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}

/** The Monday on or before a date. */
function mondayOf(d: Date): Date {
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const back = day === 0 ? 6 : day - 1;
  return new Date(d.getTime() - back * 86400000);
}

/**
 * Which week the season is currently on.
 *
 * A week runs Monday to Sunday, so the week that just finished stays current
 * through the weekend — its scores are what people are looking for on a
 * Saturday — and the board turns over on Monday morning.
 *
 * The window for each week is taken from the date most of its games are on,
 * rather than from a configured season start, so a schedule change cannot put
 * this out of step with the fixtures. Before the season it returns the first
 * week; after it, the last.
 */
export function currentWeekKey(
  games: Pick<Game, "type" | "round" | "week" | "date">[],
  now: Date = new Date(),
): string | null {
  const dates = new Map<string, Map<number, number>>();
  for (const g of games) {
    const d = parseGameDate(g.date ?? null);
    if (!d) continue;
    const k = weekKey(g);
    const tally = dates.get(k) ?? new Map<number, number>();
    tally.set(d.getTime(), (tally.get(d.getTime()) ?? 0) + 1);
    dates.set(k, tally);
  }
  if (!dates.size) return null;

  // The modal date for each week — a handful of Thursday games must not drag
  // the window a day earlier than the week actually sits.
  const weeks = [...dates.entries()]
    .map(([k, tally]) => {
      const [best] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
      return { key: k, monday: mondayOf(new Date(best[0])) };
    })
    .sort((a, b) => weekOrder(a.key) - weekOrder(b.key));

  const today = todayInAlabama(now).getTime();
  for (const w of weeks) {
    const start = w.monday.getTime();
    if (today >= start && today < start + 7 * 86400000) return w.key;
  }
  return today < weeks[0].monday.getTime()
    ? weeks[0].key
    : weeks[weeks.length - 1].key;
}

export interface Record2 {
  wins: number;
  losses: number;
}

/**
 * Region record for every team.
 *
 * A region game is one between two schools in the same classification AND the
 * same region — the games data does not flag them, and that pairing is what
 * defines one. Non-region games, out-of-state games and playoff games are all
 * excluded.
 *
 * This is the record that decides who reaches the playoffs in Alabama, which
 * is why it is worth showing beside a rating that has no bearing on it.
 */
export function regionRecords(
  ratings: Pick<RatingRow, "name" | "classification" | "region">[],
  games: Pick<Game, "t1" | "t2" | "s1" | "s2" | "type" | "forfeit_by">[],
): Map<string, Record2> {
  const meta = new Map<string, { c: Classification; r: number }>();
  for (const t of ratings) meta.set(t.name, { c: t.classification, r: t.region });

  const out = new Map<string, Record2>();
  for (const t of ratings) out.set(t.name, { wins: 0, losses: 0 });

  for (const g of games) {
    if (g.type === "playoff") continue;
    // A forfeit counts here even with no score behind it — a team that does
    // not field a side still loses the region game, and this is the table
    // that decides who plays in November.
    if (!g.forfeit_by && (g.s1 === null || g.s2 === null)) continue;
    const a = meta.get(g.t1);
    const b = meta.get(g.t2);
    if (!a || !b) continue; // one side is out of state
    if (a.c !== b.c || a.r !== b.r) continue; // not a region game
    const winner = officialWinner(g);
    if (!winner) continue; // a tie
    const w = out.get(winner === "t1" ? g.t1 : g.t2);
    const l = out.get(winner === "t1" ? g.t2 : g.t1);
    if (w) w.wins++;
    if (l) l.losses++;
  }
  return out;
}

/**
 * Everything the tiebreak chain needs about a season, gathered once.
 *
 * The association's later factors reach past the region — non-region common
 * opponents, the victories of the teams you beat — so this carries every game,
 * not only the region ones.
 */
export function tieDataFor(
  ratings: Pick<RatingRow, "name" | "classification" | "region" | "wins" | "rating">[],
  games: Pick<Game, "t1" | "t2" | "s1" | "s2" | "type" | "forfeit_by">[],
): TieData {
  const meta = new Map<string, { c: Classification; r: number }>();
  for (const t of ratings) meta.set(t.name, { c: t.classification, r: t.region });

  const results = new Map<string, TieGame[]>();
  const beat = new Set<string>();
  const met = new Set<string>();
  for (const t of ratings) results.set(t.name, []);

  for (const g of games) {
    if (g.type === "playoff") continue;
    const winner = officialWinner(g);
    if (!winner) continue; // unplayed or drawn
    const a = meta.get(g.t1);
    const b = meta.get(g.t2);
    const required = Boolean(a && b && a.c === b.c && a.r === b.r);
    const w = winner === "t1" ? g.t1 : g.t2;
    const l = winner === "t1" ? g.t2 : g.t1;
    results.get(g.t1)?.push({ opponent: g.t2, won: winner === "t1", required });
    results.get(g.t2)?.push({ opponent: g.t1, won: winner === "t2", required });
    if (required) {
      beat.add(`${w}|${l}`);
      met.add(`${g.t1}|${g.t2}`);
      met.add(`${g.t2}|${g.t1}`);
    }
  }

  const victories = new Map<string, number>();
  const rating = new Map<string, number>();
  const classOrder = new Map<string, number>();
  for (const t of ratings) {
    victories.set(t.name, t.wins);
    rating.set(t.name, t.rating);
    classOrder.set(t.name, CLS_ORDER[t.classification] ?? 0);
  }

  return { results, beat, met, victories, rating, classOrder };
}

export interface TieData {
  results: Map<string, TieGame[]>;
  beat: Set<string>;
  met: Set<string>;
  victories: Map<string, number>;
  rating: Map<string, number>;
  classOrder: Map<string, number>;
}

/** Turns the gathered season into the context the chain reads. */
export function tieContext(
  data: TieData,
  teamAtPlace: (place: number) => string | null,
): TieContext {
  return {
    beat: (a, b) => data.beat.has(`${a}|${b}`),
    metRequired: (a, b) => data.met.has(`${a}|${b}`),
    teamAtPlace,
    results: (t) => data.results.get(t) ?? [],
    victories: (t) => data.victories.get(t) ?? 0,
    classOrder: (t) => data.classOrder.get(t) ?? null,
    rating: (t) => data.rating.get(t) ?? 0,
  };
}

/**
 * Standings order for one region, best first.
 *
 * The ordering itself lives in tiebreak.ts, shared with the playoff
 * simulation. It used to live here too, differently — this one went from the
 * record straight to the rating and never looked at head-to-head — so the
 * standings page and the odds page could disagree about who was in a playoff
 * place. They now cannot.
 */
export function orderRegionStandings(
  teams: RatingRow[],
  reg: Map<string, Record2>,
  data: TieData,
): RatingRow[] {
  const by = new Map(teams.map((t) => [t.name, t]));
  const order = orderRegion(
    teams.map((t) => t.name),
    (name) => reg.get(name) ?? { wins: 0, losses: 0 },
    (teamAtPlace) => tieContext(data, teamAtPlace),
  );
  return order.map((n) => by.get(n) as RatingRow);
}
