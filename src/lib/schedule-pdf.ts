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
  splitLeadingDate,
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

/**
 * Merges runs that belong to one cell, and only those.
 *
 * A run that starts before the previous one ends is a name broken mid-word
 * and has to be rejoined; a run that starts after a gap is the next column.
 * The threshold used to be 4pt, which was wrong in the dangerous direction:
 * in Week 9 of 2026 the date column sat 3.8pt from the home column and the
 * two merged, so every row failed its date test and the week imported
 * nothing. Week 7's print put the same pair 5.0pt apart and parsed cleanly.
 *
 * Measured across every sheet to hand — Weeks 0, 2, 7 and 9 of 2026, 6,296
 * gaps between consecutive runs: the only sub-zero gaps are two genuine
 * mid-name splits in Week 0, and the tightest real column gap is 2.63pt.
 * Nothing at all falls between. 2pt sits inside that window with room on
 * both sides, where 4pt sat on the wrong side of it.
 *
 * A threshold is still a measurement, and the next print will move it again,
 * so the date is additionally put back in its own cell by structure rather
 * than by spacing — see `splitLeadingDate`.
 */
const CELL_GAP = 2;

function toCells(row: Row): string[] {
  const cells: string[] = [];
  let cur = "";
  let prevEnd = -Infinity;
  for (const it of row.items) {
    if (cur && it.x - prevEnd > CELL_GAP) {
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
  // Rows that carry a classification — so they are plainly fixtures — but
  // whose first cell is not a date this parser knows. See below.
  const dateless: string[] = [];

  for (const page of pages) {
    for (const row of page) {
      let cells = toCells(row);
      if (!cells.length) continue;

      // Two columns printed close enough together arrive as one cell. When
      // that happens to the date and whatever sits beside it, put the date
      // back in a cell of its own rather than losing the row — the grouping
      // is a measurement, and this is not a thing to lose a week's results
      // over. See `splitLeadingDate`.
      const split = splitLeadingDate(cells[0]);
      if (split) cells = [split[0], split[1], ...cells.slice(1)];

      if (!DATE_RE.test(cells[0])) {
        // Everything that is not a fixture lands here too — titles, headers,
        // the blank rows Excel prints between blocks — so silence is right
        // for almost all of it. What is not right is silence when the row is
        // obviously a game and only its date cell was unrecognised: that is
        // the format moving under us, and it is exactly how Week 7 2026 came
        // out as nought rows, nought skipped, nought warnings, with nothing
        // to work back from. A fixture is recognisable without its date.
        if (cells.length >= 5 && cells.some((c) => CLASS_RE.test(c))) {
          dateless.push(cells.join("  "));
        }
        continue;
      }

      // A row carrying only a date is the tail of a wrapped stadium name.
      if (cells.length === 1) continue;

      const line = cells.join("  ");
      const fields = readRow(cells);
      if (!fields) skipped.push({ line, reason: "Could not read row layout" });
      else rows.push({ fields, line });
    }
  }

  const extraWarnings: string[] = [];
  if (dateless.length) {
    extraWarnings.push(
      `${dateless.length} row(s) look like fixtures but their first cell is not a date ` +
        `this reader knows — the sheet's date format may have changed. First one: ` +
        `"${dateless[0].slice(0, 120)}"`,
    );
  }

  return assemble(rows, teams, extraAliases, { skipped, extraWarnings });
}
