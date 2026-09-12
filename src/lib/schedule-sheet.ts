/**
 * Parsing the AHSAA's weekly results spreadsheet.
 *
 * From week three of 2026 the association stopped mailing the PDF and shared
 * the same table as a Google Sheet instead. That is strictly better to read:
 * where the PDF had to have its columns inferred from token patterns, a sheet
 * has real columns, and a school whose name contains a comma ("Central HS,
 * Phenix City") arrives as one field instead of two.
 *
 * So this reader is positional, and takes its positions from the header row
 *
 *     DATE,TIME,HOME,CLASS,REG,SCORE,VISITOR,CLASS,REG,SCORE,SITE
 *
 * rather than from fixed offsets, so a column inserted next season shifts the
 * layout instead of corrupting every row. The header repeats once per day
 * block; each one re-reads the layout.
 *
 * The sheet is a printable document rather than a data export, so it is full
 * of things that are not games: a title line, a banner per day, section labels
 * ("OTHER THURSDAY GAMES"), blank spacers, and at least one row whose date
 * cell reads 09-11-200099. All of those are recognised and passed over
 * silently — a row only counts as a game when it names two schools.
 *
 * Accepts comma- or tab-separated text, because selecting the sheet and
 * copying it yields tabs while File → Download → CSV yields commas. Both are
 * the same table and both should work.
 */

import { parseCsvText } from "./csv";
import {
  asScore,
  assemble,
  DATE_RE,
  displayDate,
  type ParseReport,
  type RowFields,
} from "./schedule-rows";
import type { Team } from "./types";

/** Where each field sits. Defaults describe the sheet as published in 2026. */
interface Layout {
  date: number;
  home: number;
  homeClass: number;
  homeRegion: number;
  homeScore: number;
  away: number;
  awayClass: number;
  awayRegion: number;
  awayScore: number;
  site: number;
}

const DEFAULT_LAYOUT: Layout = {
  date: 0,
  home: 2,
  homeClass: 3,
  homeRegion: 4,
  homeScore: 5,
  away: 6,
  awayClass: 7,
  awayRegion: 8,
  awayScore: 9,
  site: 10,
};

const clean = (cells: string[], i: number): string =>
  (cells[i] ?? "").replace(/\s+/g, " ").trim();

/** True for the DATE,TIME,HOME,… line that heads each day's block. */
function isHeader(cells: string[]): boolean {
  const up = cells.map((c) => c.trim().toUpperCase());
  return up.includes("HOME") && up.includes("VISITOR");
}

/**
 * Reads a header row into a layout.
 *
 * HOME and VISITOR bracket the two halves; within each half the CLASS, REG and
 * SCORE labels are taken in place. A label the header does not carry keeps its
 * default position, which is what lets a sheet with, say, no TIME column still
 * read correctly.
 */
function readLayout(cells: string[]): Layout {
  const up = cells.map((c) => c.trim().toUpperCase());
  const homeAt = up.indexOf("HOME");
  const awayAt = up.indexOf("VISITOR");
  if (homeAt < 0 || awayAt < 0 || awayAt < homeAt) return DEFAULT_LAYOUT;

  const siteAt = up.indexOf("SITE", awayAt);
  const end = siteAt < 0 ? up.length : siteAt;
  const find = (label: string, from: number, to: number, fallback: number) => {
    for (let i = from; i < to; i++) if (up[i] === label) return i;
    return fallback;
  };

  return {
    date: up.indexOf("DATE") < 0 ? DEFAULT_LAYOUT.date : up.indexOf("DATE"),
    home: homeAt,
    homeClass: find("CLASS", homeAt, awayAt, homeAt + 1),
    homeRegion: find("REG", homeAt, awayAt, homeAt + 2),
    homeScore: find("SCORE", homeAt, awayAt, awayAt - 1),
    away: awayAt,
    awayClass: find("CLASS", awayAt, end, awayAt + 1),
    awayRegion: find("REG", awayAt, end, awayAt + 2),
    awayScore: find("SCORE", awayAt, end, end - 1),
    site: siteAt < 0 ? DEFAULT_LAYOUT.site : siteAt,
  };
}

/**
 * Splits on tabs when the text is tab-separated, commas otherwise.
 *
 * Deciding by which delimiter appears on the first non-blank line is enough: a
 * copied selection has a tab in every row and a downloaded CSV has none. Both
 * go through the same quote-aware reader, because both quote the one cell that
 * needs it — the stadium called Ben Glover Stadium, "The Battlefield".
 */
function toRows(text: string): string[][] {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  return parseCsvText(text, firstLine.includes("\t") ? "\t" : ",");
}

export interface SheetParseReport extends ParseReport {
  /** Games the sheet lists without a usable score, and what it said instead. */
  unplayed: { matchup: string; note: string }[];
}

export function parseScheduleSheet(
  text: string,
  teams: Team[],
  extraAliases: Record<string, string> = {},
): SheetParseReport {
  const rows = toRows(text);

  let layout = DEFAULT_LAYOUT;
  /**
   * The two rows the AHSAA typed without a date sit in the middle of the
   * Friday block, so the date above them is the right one. Carrying it forward
   * beats leaving the game undated, which would drop it off the schedule page.
   */
  let lastDate = "";

  const parsed: { fields: RowFields; line: string }[] = [];
  const unplayed: { matchup: string; note: string }[] = [];
  const warnings: string[] = [];

  for (const cells of rows) {
    if (isHeader(cells)) {
      layout = readLayout(cells);
      continue;
    }

    const rawDate = clean(cells, layout.date);
    if (DATE_RE.test(rawDate)) lastDate = displayDate(rawDate);

    const home = clean(cells, layout.home);
    const away = clean(cells, layout.away);
    // Titles, day banners, section labels and spacers all fail this: they fill
    // at most one of the two name columns.
    if (!home || !away) continue;

    const homeCell = clean(cells, layout.homeScore);
    const awayCell = clean(cells, layout.awayScore);
    const homeScore = asScore(homeCell);
    const awayScore = asScore(awayCell);

    // A score column that holds something other than a number is the sheet
    // saying why there is no result — "PP Sat" for a game moved to Saturday.
    // The game still imports, as a scheduled one.
    const note = [homeCell, awayCell].find((c) => c && asScore(c) === null);
    if (homeScore === null || awayScore === null) {
      unplayed.push({
        matchup: `${home} vs ${away}`,
        note: note ? `sheet reads “${note}”` : "no score yet",
      });
    }

    parsed.push({
      fields: {
        date: DATE_RE.test(rawDate) ? displayDate(rawDate) : lastDate,
        home,
        cl1: clean(cells, layout.homeClass),
        reg1: clean(cells, layout.homeRegion),
        homeScore,
        away,
        cl2: clean(cells, layout.awayClass),
        reg2: clean(cells, layout.awayRegion),
        awayScore,
        location: clean(cells, layout.site),
      },
      line: cells.map((c) => c.trim()).filter(Boolean).join("  "),
    });

    if (!DATE_RE.test(rawDate)) {
      warnings.push(
        `${home} vs ${away} has no date in the sheet; using ${lastDate || "none"} from the row above.`,
      );
    }
  }

  const report = assemble(parsed, teams, extraAliases, {
    extraWarnings: warnings,
  });
  return { ...report, unplayed };
}
