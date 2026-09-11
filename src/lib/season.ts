/**
 * Season-shaped helpers: region records, and which week the season is on.
 *
 * Both are derived from the games rather than configured, so neither needs
 * touching when the calendar moves.
 */
import type { Classification, Game, RatingRow } from "./types";

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
  games: Pick<Game, "t1" | "t2" | "s1" | "s2" | "type">[],
): Map<string, Record2> {
  const meta = new Map<string, { c: Classification; r: number }>();
  for (const t of ratings) meta.set(t.name, { c: t.classification, r: t.region });

  const out = new Map<string, Record2>();
  for (const t of ratings) out.set(t.name, { wins: 0, losses: 0 });

  for (const g of games) {
    if (g.type === "playoff") continue;
    if (g.s1 === null || g.s2 === null) continue;
    const a = meta.get(g.t1);
    const b = meta.get(g.t2);
    if (!a || !b) continue; // one side is out of state
    if (a.c !== b.c || a.r !== b.r) continue; // not a region game
    if (g.s1 === g.s2) continue;
    const homeWon = Number(g.s1) > Number(g.s2);
    const w = out.get(homeWon ? g.t1 : g.t2);
    const l = out.get(homeWon ? g.t2 : g.t1);
    if (w) w.wins++;
    if (l) l.losses++;
  }
  return out;
}

/**
 * Standings order: region record first, then rating, then overall record.
 *
 * Region record is compared by win percentage before win count, which is how a
 * standings table reads — 1-0 leads 3-1 — with the count breaking ties so 2-0
 * sits above 1-0. A team yet to open region play counts as neutral rather than
 * as a loss, so it is not buried beneath teams that have started and lost.
 */
export function standingsCompare(
  a: RatingRow,
  b: RatingRow,
  reg: Map<string, Record2>,
): number {
  const ra = reg.get(a.name) ?? { wins: 0, losses: 0 };
  const rb = reg.get(b.name) ?? { wins: 0, losses: 0 };
  const pct = (r: Record2) =>
    r.wins + r.losses ? r.wins / (r.wins + r.losses) : 0.5;
  if (pct(ra) !== pct(rb)) return pct(rb) - pct(ra);
  if (ra.wins !== rb.wins) return rb.wins - ra.wins;
  if (a.rating !== b.rating) return b.rating - a.rating;
  const opct = (t: RatingRow) =>
    t.wins + t.losses ? t.wins / (t.wins + t.losses) : 0;
  if (opct(a) !== opct(b)) return opct(b) - opct(a);
  return a.name.localeCompare(b.name);
}
