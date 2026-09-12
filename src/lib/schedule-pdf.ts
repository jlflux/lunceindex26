/**
 * Parsing AHSAA weekly schedule PDFs.
 *
 * These are Excel print-to-PDF, so each cell arrives from pdf.js as its own
 * positioned text run. We group runs into rows by y-position, then identify
 * fields by token pattern — the two CL/REG pairs bracket the home and visitor
 * names — rather than by column geometry. Geometry alone is not enough: the
 * header row only appears on some pages, so a parser keyed to header offsets
 * silently drops every continuation page. (The spreadsheet the AHSAA now
 * publishes does have real columns; see schedule-sheet.ts.)
 *
 * The PDFs are unreliable in specific, recurring ways — all handled here:
 *   - the same matchup listed twice with a different classification each time
 *   - classification typos (`4a\``) and stale labels (`7A`)
 *   - out-of-state opponents, whose CL is a state association and REG is "NA"
 *   - rows where a long stadium name pushes CONTRACT onto its own line,
 *     leaving an orphan date cell behind
 *   - schools absent from the roster entirely
 *
 * Everything past "this row says these two schools played" lives in
 * schedule-rows.ts, shared with the spreadsheet reader.
 */

import {
  asScore,
  assemble,
  CLASS_RE,
  DATE_RE,
  displayDate,
  REGION_RE,
  SCORE_RE,
  type ParseReport,
  type RowFields,
} from "./schedule-rows";
import type { Team } from "./types";

export type { ParsedGame, ParseReport } from "./schedule-rows";
export { toGames } from "./schedule-rows";

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
  const pages = await extractItems(data);

  const rows: { fields: RowFields; line: string }[] = [];
  const skipped: { line: string; reason: string }[] = [];

  for (const page of pages) {
    for (const row of page) {
      const cells = toCells(row);
      if (!cells.length || !DATE_RE.test(cells[0])) continue;

      // A row carrying only a date is the tail of a wrapped stadium name.
      if (cells.length === 1) continue;

      const line = cells.join("  ");
      const fields = readRow(cells);
      if (!fields) skipped.push({ line, reason: "Could not read row layout" });
      else rows.push({ fields, line });
    }
  }

  return assemble(rows, teams, extraAliases, { skipped });
}
