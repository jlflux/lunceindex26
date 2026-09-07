/**
 * Parsing AHSAA weekly schedule PDFs.
 *
 * These are Excel print-to-PDF, so each cell arrives from pdf.js as its own
 * positioned text run. We group runs into rows by y-position, then identify
 * fields by token pattern — the two CL/REG pairs bracket the home and visitor
 * names — rather than by column geometry. Geometry alone is not enough: the
 * header row only appears on some pages, so a parser keyed to header offsets
 * silently drops every continuation page.
 *
 * The PDFs are unreliable in specific, recurring ways — all handled here:
 *   - the same matchup listed twice with a different classification each time
 *   - classification typos (`4a\``) and stale labels (`7A`)
 *   - out-of-state opponents, whose CL is a state association and REG is "NA"
 *   - rows where a long stadium name pushes CONTRACT onto its own line,
 *     leaving an orphan date cell behind
 *   - schools absent from the roster entirely
 *
 * Classification always comes from the roster, never from the PDF.
 */

import {
  buildIndex,
  isOutOfStateToken,
  matchTeam,
  type MatchResult,
  type MatcherIndex,
} from "./names";
import type { Game, Team } from "./types";

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

interface Row {
  y: number;
  items: TextItem[];
}

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

/** Extracts positioned text runs from every page. */
async function extractItems(data: Uint8Array): Promise<Row[][]> {
  // Legacy build runs under Node without a DOM.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const pages: Row[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const it of content.items as unknown[]) {
      const item = it as { str: string; transform: number[]; width: number };
      if (!item.str || !item.str.trim()) continue;
      items.push({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
      });
    }
    pages.push(groupRows(items));
  }
  return pages;
}

/** Buckets text runs into rows by y-position (2pt tolerance). */
function groupRows(items: TextItem[]): Row[] {
  const rows: Row[] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) < 2.5);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);
  return rows;
}

/** Merges runs separated by less than 4pt — occasional mid-name splits. */
function toCells(row: Row): string[] {
  const cells: string[] = [];
  let cur = "";
  let prevEnd = -Infinity;
  for (const it of row.items) {
    if (cur && it.x - prevEnd > 4) {
      cells.push(cur.replace(/\s+/g, " ").trim());
      cur = "";
    }
    cur += (cur ? " " : "") + it.str;
    prevEnd = it.x + it.width;
  }
  if (cur.trim()) cells.push(cur.replace(/\s+/g, " ").trim());
  return cells;
}

/**
 * Two date formats appear in the same file. Most rows read "Aug. 21, 2026",
 * but sections the AHSAA built differently carry a raw Excel serial date
 * ("2026-08-22 0:00:00"). Matching only the first silently drops every row in
 * those sections — the Week 0 Saturday block went missing this way.
 */
const DATE_RE =
  /^(?:[A-Z][a-z]{2}\.?\s+\d{1,2},\s*\d{4}|\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?|\d{2}-\d{2}-\d{4})$/;

/** Normalises either form to the display format used everywhere else. */
function displayDate(raw: string): string {
  // Two orderings in circulation: the schedule sheets write YYYY-MM-DD, the
  // results sheets MM-DD-YYYY. Both reach here.
  const usa = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const ymd = usa
    ? { y: usa[3], m: usa[1], d: usa[2] }
    : (() => {
        const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? { y: m[1], m: m[2], d: m[3] } : null;
      })();
  if (!ymd) return raw;

  const d = new Date(`${ymd.y}-${ymd.m}-${ymd.d}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).replace(/^(\w{3})/, "$1.");
}

/**
 * A classification cell: an AHSAA class (tolerating the `4a\`` typos and the
 * stale `7A` label) or another state's association.
 */
const CLASS_RE =
  /^(Double\s*-?\s*AA|Single\s*-?\s*A|Ind-AA|Ind-A|[1-7][Aa][`'’]?|FHSAA?|GHSAA?|MHSAA?|TSSAA|LHSAA|MAIS|GISA)$/i;

/** A region cell. Out-of-state rows carry "NA". */
const REGION_RE = /^(R-?\s?\d|NA)$/i;

interface RowFields {
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

/** A score cell: a bare number a football team could plausibly have scored. */
const SCORE_RE = /^\d{1,3}$/;
const asScore = (cell: string | undefined): number | null => {
  if (!cell || !SCORE_RE.test(cell)) return null;
  const n = Number(cell);
  return n <= 200 ? n : null;
};

/**
 * Splits a row's cells into fields. The two classification cells are the
 * anchors: everything between the date and the first is the home name,
 * everything between the first pair and the second is the visitor.
 */
function readRow(cells: string[]): RowFields | null {
  if (cells.length < 5 || !DATE_RE.test(cells[0])) return null;

  // A time can follow the date as its own cell — "0:00:00" on the schedule
  // sheets, "7:00 PM" on the results sheets. Either way it is not part of the
  // home team's name.
  if (/^\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?$/i.test(cells[1] ?? "")) {
    cells = [cells[0], ...cells.slice(2)];
  }

  const classIdx: number[] = [];
  for (let i = 1; i < cells.length; i++) {
    if (CLASS_RE.test(cells[i])) classIdx.push(i);
  }

  // Some result rows arrive with the class and region cells simply left
  // blank, leaving date, name, score, name, score. The names and the result
  // are all there, so the row is still worth reading — it just has to be
  // matched without a classification to disambiguate with.
  if (classIdx.length < 2) {
    const bare =
      cells.length === 5 &&
      asScore(cells[2]) !== null &&
      asScore(cells[4]) !== null &&
      !SCORE_RE.test(cells[1]) &&
      !SCORE_RE.test(cells[3]);
    if (!bare) return null;
    return {
      date: displayDate(cells[0]),
      home: cells[1],
      cl1: "",
      reg1: "",
      homeScore: asScore(cells[2]),
      away: cells[3],
      cl2: "",
      reg2: "",
      awayScore: asScore(cells[4]),
      location: "",
    };
  }

  const [i1, i2] = classIdx;
  // The region cell is optional — one 2026 row reads "not in championship
  // play" where the region belongs.
  const hasReg1 = i1 + 1 < cells.length && REGION_RE.test(cells[i1 + 1]);
  const hasReg2 = i2 + 1 < cells.length && REGION_RE.test(cells[i2 + 1]);

  const homeStart = 1;
  // On a results sheet the home score sits between the home region and the
  // visitor's name. Taken only when it is a bare number, so "Washington
  // County HS" does not lose its first word to a missing score.
  const afterReg1 = i1 + (hasReg1 ? 2 : 1);
  const homeScore = asScore(cells[afterReg1]);
  const awayStart = afterReg1 + (homeScore === null ? 0 : 1);
  if (i1 <= homeStart - 1 || i2 <= awayStart - 1) return null;

  const afterReg2 = i2 + (hasReg2 ? 2 : 1);
  const awayScore = asScore(cells[afterReg2]);

  return {
    date: displayDate(cells[0]),
    home: cells.slice(homeStart, i1).join(" ").trim(),
    cl1: cells[i1],
    reg1: hasReg1 ? cells[i1 + 1] : "",
    homeScore,
    away: cells.slice(awayStart, i2).join(" ").trim(),
    cl2: cells[i2],
    reg2: hasReg2 ? cells[i2 + 1] : "",
    awayScore,
    // Anything left is a note — "GAME SUSPENDED UNTIL 9AM SATURDAY".
    location: cells.slice(afterReg2 + (awayScore === null ? 0 : 1)).join(" ").trim(),
  };
}

export async function parseSchedulePdf(
  data: Uint8Array,
  teams: Team[],
  extraAliases: Record<string, string> = {},
): Promise<ParseReport> {
  const index = buildIndex(teams);
  const pages = await extractItems(data);

  const games: ParsedGame[] = [];
  const skipped: { line: string; reason: string }[] = [];
  const warnings: string[] = [];
  const duplicates: string[] = [];
  let totalRows = 0;

  for (const rows of pages) {
    for (const row of rows) {
      const cells = toCells(row);
      if (!cells.length || !DATE_RE.test(cells[0])) continue;

      const line = cells.join("  ");

      // A row carrying only a date is the tail of a wrapped stadium name.
      if (cells.length === 1) continue;

      const fields = readRow(cells);
      if (!fields) {
        totalRows++;
        skipped.push({ line, reason: "Could not read row layout" });
        continue;
      }

      totalRows++;
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
  }

  return {
    games: dedupe(games, duplicates),
    skipped,
    warnings: [...new Set(warnings)],
    duplicates,
    totalRows,
  };
}

/**
 * The PDFs list some matchups twice, differing only in the classification
 * column. Since classification comes from the roster anyway, the duplicates
 * are identical games — keep the first.
 */
function dedupe(games: ParsedGame[], log: string[]): ParsedGame[] {
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

/** Turns parsed rows into insertable games. Scores stay null. */
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
