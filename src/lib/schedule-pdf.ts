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

const DATE_RE = /^[A-Z][a-z]{2}\.?\s+\d{1,2},\s*\d{4}$/;

/**
 * A classification cell: an AHSAA class (tolerating the `4a\`` typos and the
 * stale `7A` label) or another state's association.
 */
const CLASS_RE =
  /^(Ind-AA|Ind-A|[1-7][Aa][`'’]?|FHSAA?|GHSAA?|MHSAA?|TSSAA|LHSAA|MAIS|GISA)$/;

/** A region cell. Out-of-state rows carry "NA". */
const REGION_RE = /^(R-?\s?\d|NA)$/i;

interface RowFields {
  date: string;
  home: string;
  cl1: string;
  reg1: string;
  away: string;
  cl2: string;
  reg2: string;
  location: string;
}

/**
 * Splits a row's cells into fields. The two classification cells are the
 * anchors: everything between the date and the first is the home name,
 * everything between the first pair and the second is the visitor.
 */
function readRow(cells: string[]): RowFields | null {
  if (cells.length < 5 || !DATE_RE.test(cells[0])) return null;

  const classIdx: number[] = [];
  for (let i = 1; i < cells.length; i++) {
    if (CLASS_RE.test(cells[i])) classIdx.push(i);
  }
  if (classIdx.length < 2) return null;

  const [i1, i2] = classIdx;
  // The region cell is optional — one 2026 row reads "not in championship
  // play" where the region belongs.
  const hasReg1 = i1 + 1 < cells.length && REGION_RE.test(cells[i1 + 1]);
  const hasReg2 = i2 + 1 < cells.length && REGION_RE.test(cells[i2 + 1]);

  const homeStart = 1;
  const awayStart = i1 + (hasReg1 ? 2 : 1);
  if (i1 <= homeStart - 1 || i2 <= awayStart - 1) return null;

  return {
    date: cells[0],
    home: cells.slice(homeStart, i1).join(" ").trim(),
    cl1: cells[i1],
    reg1: hasReg1 ? cells[i1 + 1] : "",
    away: cells.slice(awayStart, i2).join(" ").trim(),
    cl2: cells[i2],
    reg2: hasReg2 ? cells[i2 + 1] : "",
    location: cells.slice(i2 + (hasReg2 ? 2 : 1)).join(" ").trim(),
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
  return report.games.map((g) => ({
    t1: g.home.name as string,
    s1: null,
    t2: g.away.name as string,
    s2: null,
    week,
    type,
    round,
    date: g.date,
    status: "scheduled",
    neutral_site: false,
  }));
}
