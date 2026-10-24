/**
 * The AHSAA sheets, parsed.
 *
 * Two documents with the same shape: a forward schedule, and a results sheet
 * that adds score columns. Both must go through one parser, and a forward
 * schedule must never come out carrying scores.
 *
 * Usage: npx tsx scripts/test-schedule-pdf.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { parseSchedulePdf, toGames } from "../src/lib/schedule-pdf";
import { loadRosterCsv } from "../src/lib/roster-csv";
import {
  buildIndex,
  matchTeam,
  normalize,
  normalizeClassToken,
} from "../src/lib/names";
import { DATE_RE, displayDate, splitLeadingDate } from "../src/lib/schedule-rows";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const teams = loadRosterCsv("data/AHSAA_Class_List_2026.csv");
const index = buildIndex(teams);

console.log("\n0. The date cell, however Excel broke that print run");
{
  // Whether the kickoff is its own cell or merged into the date one is a
  // property of the print, not the document, and it changes between weeks.
  // Week 7 2026 merged them — "10-08-2026 7:00 PM" — and because the US date
  // branch was anchored, every row failed the date test and was dropped
  // before it was read. The import reported no rows and said nothing about
  // why, which is the part that cost the time.
  const accepts = [
    "Aug. 21, 2026",
    "Sep. 4, 2026 7:30 PM",
    "2026-08-22",
    "2026-08-22 0:00:00",
    "10-08-2026",
    "10-08-2026 7:00 PM",
    "10-09-2026 7:00PM",
    "10-09-2026 19:00",
  ];
  for (const d of accepts) check(`accepts ${JSON.stringify(d)}`, DATE_RE.test(d));

  const refuses = ["", "Benjamin Russell HS", "10-08-2026 extra", "31", "R-2"];
  for (const d of refuses) check(`refuses ${JSON.stringify(d)}`, !DATE_RE.test(d));

  // A merged time must not survive into the stored date.
  check("a merged time is dropped from the date",
    displayDate("10-08-2026 7:00 PM") === "Oct. 8, 2026",
    displayDate("10-08-2026 7:00 PM"));
  check("and the same date without one reads identically",
    displayDate("10-08-2026") === displayDate("10-08-2026 7:00 PM"));
  check("the ISO form still normalises",
    displayDate("2026-08-22 0:00:00") === "Aug. 22, 2026",
    displayDate("2026-08-22 0:00:00"));
  check("and the written form is left alone",
    displayDate("Aug. 21, 2026") === "Aug. 21, 2026");

  // Two columns printed close enough together arrive as one cell. The date
  // is put back in its own cell by structure, so no spacing threshold has to
  // be right for the row to be read.
  const split = (c: string) => splitLeadingDate(c)?.join(" | ") ?? null;
  check("a date merged with the home team is pulled apart",
    split("10-22-2026 7:00 PM Mountain Brook HS") ===
      "10-22-2026 7:00 PM | Mountain Brook HS",
    String(split("10-22-2026 7:00 PM Mountain Brook HS")));
  check("with no kickoff between them either",
    split("10-22-2026 Mountain Brook HS") === "10-22-2026 | Mountain Brook HS");
  check("the written form splits too",
    split("Sep. 4, 2026 7:30 PM Hoover HS") === "Sep. 4, 2026 7:30 PM | Hoover HS");
  check("the Excel serial form splits too",
    split("2026-08-22 0:00:00 Thompson HS") === "2026-08-22 0:00:00 | Thompson HS");
  check("a cell holding only a date is left whole",
    split("10-22-2026 7:00 PM") === null && split("10-22-2026") === null);
  check("and a cell holding no date is left alone",
    split("Mountain Brook HS") === null);
}

console.log("\n1. Names the results sheets spell differently");
{
  // Every one of these was skipped by the importer before. "HS" lands in the
  // middle of the name, which suffix stripping cannot reach.
  const cases: [string, string][] = [
    ["Central HS, Phenix City", "Central-Phenix City"],
    ["Central HS, Tuscaloosa", "Central-Tuscaloosa"],
    ["Central HS, Florence", "Central-Florence"],
    ["Southside HS, Selma", "Southside-Selma"],
    ["Hillcrest HS, Evergreen", "Hillcrest-Evergreen"],
    ["A.P. Brewer HS", "Brewer"],
    ["A.H. Parker HS", "Parker"],
    ["Paul W. Bryant HS", "Paul Bryant"],
    ["North Sand Mtn. HS", "North Sand Mountain"],
    ["Johnson Abernathy Graetz", "JAG"],
    ["Kate Duncan Smith DAR HS", "DAR"],
    ["Mattie T. Blount HS", "Blount"],
    ["Booker T. Washington HS", "BT Washington"],
    ["LeFlore Magnet HS", "LeFlore"],
    ["Pennington", "JB Pennington"],
  ];
  for (const [raw, want] of cases) {
    const got = matchTeam({ raw }, index).name;
    check(`"${raw}" → ${want}`, got === want, `got ${got ?? "no match"}`);
  }
}

console.log("\n2. Stripping HS does not collapse distinct schools");
{
  // The rule removes "hs" as a whole word anywhere. Nothing on the roster
  // should collide as a result.
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const t of teams) {
    const n = normalize(t.name);
    const prev = seen.get(n);
    if (prev && prev !== t.name) clashes.push(`${prev} / ${t.name}`);
    seen.set(n, t.name);
  }
  check(
    "no two roster names normalize alike",
    clashes.length === 0,
    clashes.join(", "),
  );
}

console.log("\n3. The private classes, however they are written");
{
  // The results sheets write the private bracket out in words. Read as an
  // unknown class the row loses its anchors entirely, which took out every
  // private-school game on the sheet.
  for (const [raw, want] of [
    ["Double AA", "AA"],
    ["Single A", "A"],
    ["Ind-AA", "AA"],
    ["Ind-A", "A"],
    ["6A", "6A"],
    ["7A", "6A"],
  ] as [string, string][]) {
    const got = normalizeClassToken(raw);
    check(`"${raw}" is class ${want}`, got === want, `got ${got ?? "null"}`);
  }
  check(
    "a state association is not read as a class",
    normalizeClassToken("GHSA") === null,
  );
}

const RESULTS = "data/2026_Week_2_Scores.pdf";
const SCHEDULE = "data/2026_Week_0_Football.pdf";
// Week 9 is kept because of how its columns are spaced, not its results:
// the date column prints 3.8pt from the home column there, which is the
// tightest in any sheet to hand and the one that broke the reader.
const TIGHT = "data/2026_Week_9_Scores.pdf";

async function main() {
  if (existsSync(RESULTS)) {
    console.log("\n4. A results sheet, end to end");
    const report = await parseSchedulePdf(
      new Uint8Array(readFileSync(RESULTS)),
      teams,
    );
    const games = toGames(report, 2);
    const scored = games.filter((g) => g.s1 !== null && g.s2 !== null);

    check(
      "reads all but a handful of rows",
      report.games.length >= report.totalRows - 3,
      `${report.games.length} of ${report.totalRows}`,
    );
    check(
      "nearly every game carries a score",
      scored.length >= games.length - 3,
      `${scored.length} of ${games.length}`,
    );
    check(
      "an unfinished game gets no score rather than a 0-0",
      games.every((g) => (g.s1 === null) === (g.s2 === null)),
    );
    check(
      "no score is implausible",
      scored.every(
        (g) => (g.s1 as number) <= 200 && (g.s2 as number) <= 200,
      ),
    );
    check(
      "a played game is marked final",
      scored.every((g) => g.status === "final"),
    );

    // Spot-checks read straight off the PDF.
    for (const [home, hs, away, as_] of [
      ["Corner", 28, "Bibb County", 42],
      ["Asbury", 14, "DAR", 62],
      ["Murphy", 0, "Blount", 43],
    ] as [string, number, string, number][]) {
      const g = games.find((x) => x.t1 === home && x.t2 === away);
      check(
        `${home} ${hs}–${as_} ${away}`,
        !!g && g.s1 === hs && g.s2 === as_,
        g ? `got ${g.s1}–${g.s2}` : "game not found",
      );
    }
  }

  if (existsSync(SCHEDULE)) {
    console.log("\n5. A forward schedule still carries no scores");
    const report = await parseSchedulePdf(
      new Uint8Array(readFileSync(SCHEDULE)),
      teams,
    );
    const games = toGames(report, 0);
    check(
      "every game is unscored",
      games.every((g) => g.s1 === null && g.s2 === null),
      `${games.filter((g) => g.s1 !== null).length} came back scored`,
    );
    check(
      "and still parses the whole sheet",
      games.length >= 138,
      `${games.length} games`,
    );
  }

  if (existsSync(TIGHT)) {
    console.log("\n6. A sheet whose columns very nearly touch");
    const report = await parseSchedulePdf(
      new Uint8Array(readFileSync(TIGHT)),
      teams,
    );
    // This sheet read as nought games until the date stopped depending on a
    // 4pt measurement: its date column sits 3.8pt from the home column, so
    // the two merged and every row failed its date test.
    check(
      "every row is read",
      report.totalRows > 150 && report.skipped.length === 0,
      `${report.totalRows} rows, ${report.skipped.length} skipped`,
    );
    check(
      "and nothing is left looking like an unreadable date",
      !report.warnings.some((w) => w.includes("not a date this reader knows")),
      report.warnings.join(" / "),
    );
    const games = toGames(report, 9);
    check("nearly every game carries a score",
      games.filter((g) => g.s1 !== null).length >= games.length - 3,
      `${games.filter((g) => g.s1 !== null).length} of ${games.length}`);

    // The two names this sheet got wrong, both now reachable: one truncated
    // by the association's own column width, one spelt differently from the
    // roster.
    check("a name the sheet cut in half still matches",
      games.some((g) => g.t1 === "Carver-Birmingham" || g.t2 === "Carver-Birmingham"),
      "Carver-Birmingham missing");
    check("and one the association spells its own way",
      games.some((g) => g.t1 === "Snook Christian" || g.t2 === "Snook Christian"),
      "Snook Christian missing");

    // Spot-checks read straight off the PDF.
    for (const [home, hs, away, as_] of [
      ["Mountain Brook", 21, "Pelham", 25],
      ["Woodlawn", 32, "Carver-Birmingham", 26],
    ] as [string, number, string, number][]) {
      const g = games.find((x) => x.t1 === home && x.t2 === away);
      check(`${home} ${hs}–${as_} ${away}`,
        !!g && g.s1 === hs && g.s2 === as_,
        g ? `got ${g.s1}–${g.s2}` : "game not found");
    }
  }

  console.log(
    failures === 0
      ? "\nThe AHSAA sheets parse.\n"
      : `\n${failures} check(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
