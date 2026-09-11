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

  console.log(
    failures === 0
      ? "\nThe AHSAA sheets parse.\n"
      : `\n${failures} check(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
