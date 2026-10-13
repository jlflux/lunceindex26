/**
 * The part of an AHSAA weekly sheet that has nothing to do with its container.
 *
 * The association publishes the same table two ways — a print-to-PDF and, since
 * week three, a Google Sheet — and everything downstream of "this row says
 * these two schools played" is identical between them. That work lives here so
 * the PDF reader and the spreadsheet reader cannot drift apart: one matcher,
 * one set of warnings, one de-duplication rule, one way of turning a parsed row
 * into a game.
 *
 * Classification always comes from the roster, never from the sheet.
 */

import { buildIndex, matchTeam, type MatchResult } from "./names";
import type { Game, Team } from "./types";

export interface ParsedGame {
  date: string;
  home: MatchResult;
  away: MatchResult;
  homeClassToken: string;
  awayClassToken: string;
  /** Null on a forward schedule, and on a game that did not finish. */
  homeScore: number | null;
  awayScore: number | null;
  location: string;
  /** Line the row came from, for troubleshooting. */
  sourceLine: string;
}

export interface ParseReport {
  games: ParsedGame[];
  /** Rows that looked like games but could not be read. */
  skipped: { line: string; reason: string }[];
  /** Matches a human should check before importing. */
  warnings: string[];
  /** Duplicate matchups collapsed to one game. */
  duplicates: string[];
  totalRows: number;
}

/** One row of a sheet, already split into fields but not yet matched. */
export interface RowFields {
  date: string;
  home: string;
  cl1: string;
  reg1: string;
  /** Present on the results sheets, absent on a forward schedule. */
  homeScore: number | null;
  away: string;
  cl2: string;
  reg2: string;
  awayScore: number | null;
  location: string;
}

/**
 * A time tacked onto the end of a date cell.
 *
 * Whether the kickoff is its own cell or part of the date one is not a
 * property of the document — it is a property of how Excel happened to break
 * that print run into text, and it varies between weeks of the same season.
 * Week 7 2026 emitted "10-08-2026 7:00 PM" as a single run where earlier
 * sheets emitted two, and because the US date branch was anchored it matched
 * nothing: every row was dropped before it was read and the import reported
 * no rows at all, with no warning to say why.
 *
 * Allowed on all three date forms rather than only the one seen failing, so
 * the next week that merges a cell differently does not fail the same way.
 */
const TIME = String.raw`(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]\.?M\.?)?)?`;

/**
 * Three date formats are in circulation across the AHSAA's own documents:
 * "Aug. 21, 2026", the Excel serial "2026-08-22 0:00:00", and the results
 * sheets' "09-11-2026". Matching only the first silently drops every row in
 * the other sections — the Week 0 Saturday block went missing this way.
 */
export const DATE_RE = new RegExp(
  "^(?:" +
    String.raw`[A-Z][a-z]{2}\.?\s+\d{1,2},\s*\d{4}` + TIME +
    "|" +
    String.raw`\d{4}-\d{2}-\d{2}` + TIME +
    "|" +
    String.raw`\d{2}-\d{2}-\d{4}` + TIME +
    ")$",
);

/** Normalizes any of them to the display format used everywhere else. */
export function displayDate(raw: string): string {
  // A merged kickoff is dropped first, so none of the branches below have to
  // know about it and none can let it through into a stored date.
  const bare = raw
    .replace(/\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]\.?M\.?)?$/i, "")
    .trim();

  // Two orderings in circulation: the schedule sheets write YYYY-MM-DD, the
  // results sheets MM-DD-YYYY. Both reach here.
  const usa = bare.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const ymd = usa
    ? { y: usa[3], m: usa[1], d: usa[2] }
    : (() => {
        const m = bare.match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? { y: m[1], m: m[2], d: m[3] } : null;
      })();
  if (!ymd) return bare;

  const d = new Date(`${ymd.y}-${ymd.m}-${ymd.d}T00:00:00Z`);
  return d
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    })
    .replace(/^(\w{3})/, "$1.");
}

/**
 * A classification cell: an AHSAA class (tolerating the `4a\`` typos and the
 * stale `7A` label) or another state's association.
 */
export const CLASS_RE =
  /^(Double\s*-?\s*AA|Single\s*-?\s*A|Ind-AA|Ind-A|[1-7][Aa][`'’]?|FHSAA?|GHSAA?|MHSAA?|TSSAA|LHSAA|MAIS|GISA)$/i;

/** A region cell. Out-of-state rows carry "NA" or "n/a". */
export const REGION_RE = /^(R-?\s?\d|N\/?A)$/i;

/** A score cell: a bare number a football team could plausibly have scored. */
export const SCORE_RE = /^\d{1,3}$/;

export function asScore(cell: string | undefined): number | null {
  if (!cell || !SCORE_RE.test(cell)) return null;
  const n = Number(cell);
  return n <= 200 ? n : null;
}

/**
 * Matches both schools in every row and collects the problems.
 *
 * Rows that could not be split into fields at all are passed in as `skipped`
 * by the caller, since only the caller knows what a malformed row looks like
 * in its own format.
 */
export function assemble(
  rows: { fields: RowFields; line: string }[],
  teams: Team[],
  extraAliases: Record<string, string> = {},
  seed: { skipped?: { line: string; reason: string }[]; extraWarnings?: string[] } = {},
): ParseReport {
  const index = buildIndex(teams);

  const games: ParsedGame[] = [];
  const skipped = [...(seed.skipped ?? [])];
  const warnings: string[] = [...(seed.extraWarnings ?? [])];
  const duplicates: string[] = [];

  for (const { fields, line } of rows) {
    const { home: homeRaw, away: awayRaw, cl1, reg1, cl2, reg2 } = fields;

    if (!homeRaw || !awayRaw) {
      skipped.push({ line, reason: "Missing home or visitor name" });
      continue;
    }

    const home = matchTeam(
      { raw: homeRaw, classToken: cl1, regionToken: reg1, extraAliases },
      index,
    );
    const away = matchTeam(
      { raw: awayRaw, classToken: cl2, regionToken: reg2, extraAliases },
      index,
    );

    // Both sides out of state means it isn't an AHSAA game at all.
    if (home.outOfState && away.outOfState) {
      skipped.push({ line, reason: "Neither school is an AHSAA member" });
      continue;
    }
    if (!home.name || !away.name) {
      skipped.push({
        line,
        reason: [home, away]
          .filter((m) => !m.name)
          .map((m) => `Unmatched: "${m.raw}"`)
          .join("; "),
      });
      continue;
    }

    for (const m of [home, away]) if (m.note) warnings.push(m.note);

    games.push({
      date: fields.date,
      home,
      away,
      homeClassToken: cl1,
      awayClassToken: cl2,
      homeScore: fields.homeScore,
      awayScore: fields.awayScore,
      location: fields.location,
      sourceLine: line,
    });
  }

  const kept = dedupe(games, duplicates);
  return {
    games: kept,
    skipped,
    warnings: [...new Set(warnings)],
    duplicates,
    totalRows: rows.length + (seed.skipped?.length ?? 0),
  };
}

/**
 * The sheets list some matchups twice, differing only in the classification
 * column. Since classification comes from the roster anyway, the duplicates
 * are identical games — keep the first.
 */
export function dedupe(games: ParsedGame[], log: string[]): ParsedGame[] {
  const seen = new Set<string>();
  const out: ParsedGame[] = [];
  for (const g of games) {
    const key = `${g.home.name}|${g.away.name}`;
    if (seen.has(key)) {
      log.push(`${g.home.name} vs ${g.away.name} listed more than once`);
      continue;
    }
    seen.add(key);
    out.push(g);
  }
  return out;
}

/** Turns parsed rows into insertable games. */
export function toGames(
  report: ParseReport,
  week: number,
  type: "regular" | "playoff" = "regular",
  round: Game["round"] = null,
): Game[] {
  return report.games.map((g) => {
    // Both or neither. A row where only one score parsed is a game that did
    // not finish, and half a scoreline would read as a shutout.
    const played = g.homeScore !== null && g.awayScore !== null;
    return {
      t1: g.home.name as string,
      s1: played ? g.homeScore : null,
      t2: g.away.name as string,
      s2: played ? g.awayScore : null,
      week,
      type,
      round,
      date: g.date,
      status: played ? "final" : "scheduled",
      neutral_site: false,
    };
  });
}
