/**
 * The AHSAA weekly spreadsheet, parsed.
 *
 * Checked against the real Week 3 sheet rather than a tidied-up sample, since
 * every rule in the reader exists because of something the association
 * actually typed: section banners between games, two rows with no date, a
 * date reading 09-11-200099, a postponement written into the score column,
 * and half a dozen schools whose names contain commas.
 *
 * Usage: npx tsx scripts/test-schedule-sheet.ts
 */
import { readFileSync } from "node:fs";
import { loadRosterCsv } from "../src/lib/roster-csv";
import { parseScheduleSheet } from "../src/lib/schedule-sheet";
import { toGames } from "../src/lib/schedule-rows";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const teams = loadRosterCsv("data/AHSAA_Class_List_2026.csv");
const csv = readFileSync("data/samples/ahsaa-week3-sheet.csv", "utf8");
const report = parseScheduleSheet(csv, teams);
const find = (home: string, away: string) =>
  report.games.find((g) => g.home.name === home && g.away.name === away);

console.log("\n1. The whole sheet reads");
{
  // 192 game rows in the file; every one of them names two schools.
  check(
    `every row that names two schools became a game (${report.games.length})`,
    report.games.length === 192,
    `${report.games.length} games, ${report.skipped.length} skipped`,
  );
  check(
    "nothing was skipped",
    report.skipped.length === 0,
    report.skipped.map((s) => `${s.reason}: ${s.line.slice(0, 60)}`).join(" | "),
  );
  check("no duplicate listings", report.duplicates.length === 0);
}

console.log("\n2. Furniture is not mistaken for football");
{
  const names = report.games.flatMap((g) => [g.home.raw, g.away.raw]);
  for (const junk of [
    "AHSAA WOTM GAME OF THE WEEK",
    "OTHER THURSDAY GAMES",
    "AHSAA WEEK 3 Football",
    "HOME",
    "VISITOR",
  ]) {
    check(`"${junk}" is not a team`, !names.includes(junk));
  }
  // The 09-11-200099 row has no schools in it, so it must simply vanish —
  // neither a game nor a complaint.
  check(
    "the malformed date row is passed over silently",
    !report.skipped.some((s) => s.line.includes("200099")),
  );
}

console.log("\n3. Names containing a comma survive the CSV");
{
  // In the PDF these arrived as two cells and had to be stitched back
  // together. Here the quoting does the work — but only if the reader
  // respects it.
  const cases: [string, string][] = [
    ["Central HS, Phenix City", "Central-Phenix City"],
    ["Hillcrest HS, Tuscaloosa", "Hillcrest-Tuscaloosa"],
    ["Central HS, Tuscaloosa", "Central-Tuscaloosa"],
    ["Southside HS, Selma", "Southside-Selma"],
    ["Hillcrest HS, Evergreen", "Hillcrest-Evergreen"],
    ["Central, Clay County HS", "Central-Clay County"],
    ["Central HS, Hayneville", "Central-Hayneville"],
  ];
  for (const [raw, want] of cases) {
    const hit = report.games.find(
      (g) => g.home.raw === raw || g.away.raw === raw,
    );
    const got = hit ? (hit.home.raw === raw ? hit.home.name : hit.away.name) : null;
    check(`"${raw}" → ${want}`, got === want, `got ${got ?? "no row"}`);
  }
}

console.log("\n4. Scores come off the right side of the row");
{
  const g = find("Thompson", "Spain Park");
  // The sheet lists Spain Park at home, 14-48. Home and away must not swap.
  const sp = find("Spain Park", "Thompson");
  check("Spain Park is the home team", !!sp && !g, sp ? "" : "not found");
  check("Spain Park 14", sp?.homeScore === 14, `${sp?.homeScore}`);
  check("Thompson 48", sp?.awayScore === 48, `${sp?.awayScore}`);

  const shutout = find("Fyffe", "Pisgah");
  check("a shutout keeps its zero", shutout?.awayScore === 0, `${shutout?.awayScore}`);
  const one = find("Verbena", "Calhoun");
  check("1-0 is read as a score, not as blank", one?.homeScore === 1 && one?.awayScore === 0);
}

console.log("\n5. Games without a result import as scheduled, not as shutouts");
{
  // Munford/Weaver has both score cells empty; Millry/McIntosh has "PP Sat"
  // in both. Either way a score of null must not become a 0.
  const munford = find("Munford", "Weaver");
  check("an empty score is null", munford?.homeScore === null && munford?.awayScore === null);

  const millry = find("Millry", "McIntosh");
  check("a postponement is null, not NaN", millry?.homeScore === null && millry?.awayScore === null);
  check(
    "and is reported with what the sheet said",
    report.unplayed.some((u) => u.matchup.startsWith("Millry") && u.note.includes("PP Sat")),
    JSON.stringify(report.unplayed.filter((u) => u.matchup.startsWith("Millry"))),
  );
  check("both unplayed games are listed", report.unplayed.length === 2, `${report.unplayed.length}`);

  const games = toGames(report, 3);
  const m = games.find((x) => x.t1 === "Millry");
  check("and reaches the database as scheduled", m?.status === "scheduled" && m?.s1 === null);
}

console.log("\n6. Rows the AHSAA left undated take the date above them");
{
  // Two 2A rows have no date, no time and no region — the score and the two
  // schools are all that is filled in.
  const reeltown = find("Reeltown", "Horseshoe Bend");
  check("Reeltown/Horseshoe Bend is read at all", !!reeltown);
  check("with the Friday date carried down", reeltown?.date === "Sep. 11, 2026", `${reeltown?.date}`);
  check("and its score intact", reeltown?.homeScore === 47 && reeltown?.awayScore === 0);
  check(
    "the borrowed date is flagged for a human",
    report.warnings.some((w) => w.includes("Reeltown") && w.includes("no date")),
    report.warnings.filter((w) => w.includes("Reeltown")).join(" | "),
  );

  const sandRock = find("Sand Rock", "Section");
  check("Sand Rock/Section too", sandRock?.homeScore === 34 && sandRock?.awayScore === 13);
}

console.log("\n7. Dates are normalized, not passed through");
{
  const g = find("Demopolis", "Northside");
  check("09-11-2026 → Sep. 11, 2026", g?.date === "Sep. 11, 2026", `${g?.date}`);
  check(
    "every game carries a date",
    report.games.every((x) => /^[A-Z][a-z]{2}\. \d{1,2}, \d{4}$/.test(x.date)),
    report.games.find((x) => !/^[A-Z][a-z]{2}\./.test(x.date))?.date,
  );
}

console.log("\n8. Out-of-state opponents");
{
  // Pine Forest is FHSAA with region "n/a" and hosts Williamson. One side
  // being a non-member is a real game; it must not be dropped.
  const g = report.games.find((x) => x.away.name === "Williamson");
  check("the Williamson game survives", !!g, "not found");
  check("its host is marked non-AHSAA", g?.home.outOfState === true);
  check("the score is still read", g?.homeScore === 18 && g?.awayScore === 19);
}

console.log("\n9. The private bracket, written out in words");
{
  const g = find("Lee-Scott", "Briarwood");
  check("Lee-Scott hosts Briarwood", !!g, "not found");
  check(
    "“Double AA” is what the sheet wrote in the class column",
    g?.homeClassToken === "Double AA",
    `${g?.homeClassToken}`,
  );
  const single = find("Bayside Academy", "St. Luke's");
  check("“Single A” rows read too", !!single, "not found");
  check("and the class column is not trusted for it", single?.homeClassToken === "Single A");
}

console.log("\n10. A tab-separated copy of the same sheet reads identically");
{
  // Selecting the sheet and copying it yields tabs. Since no cell in the file
  // contains a tab, re-joining the parsed CSV with tabs reproduces exactly
  // what the clipboard would hold.
  const tsv = csv
    .split(/\r?\n/)
    .map((line) => {
      const out: string[] = [];
      let field = "";
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quoted) {
          if (c === '"' && line[i + 1] === '"') {
            field += '"';
            i++;
          } else if (c === '"') quoted = false;
          else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ",") {
          out.push(field);
          field = "";
        } else field += c;
      }
      out.push(field);
      return out.join("\t");
    })
    .join("\n");

  const fromTabs = parseScheduleSheet(tsv, teams);
  check(
    "same number of games",
    fromTabs.games.length === report.games.length,
    `${fromTabs.games.length} vs ${report.games.length}`,
  );
  check(
    "same matchups, same scores",
    JSON.stringify(fromTabs.games.map((g) => [g.home.name, g.homeScore, g.away.name, g.awayScore])) ===
      JSON.stringify(report.games.map((g) => [g.home.name, g.homeScore, g.away.name, g.awayScore])),
  );
}

console.log("\n11. Quoting survives in both delimiters");
{
  // The only cell in the file that needs quoting for a reason other than a
  // comma. Read naively it swallows the row.
  const rain = find("BC Rain", "Satsuma");
  check("BC Rain / Satsuma is read", !!rain, "not found");
  check(
    "the stadium keeps its inner quotes",
    rain?.location === 'Ben Glover Stadium, "The Battlefield"',
    `${rain?.location}`,
  );

  // A cell wrapped across two lines: legal in both formats, and fatal to a
  // reader that splits on newlines before it looks at the quotes.
  const header =
    "DATE,TIME,HOME,CLASS,REG,SCORE,VISITOR,CLASS,REG,SCORE,SITE\n";
  const wrapped =
    header +
    '09-11-2026,7:00 PM,Homewood HS,5A,R-4,42,Pelham HS,5A,R-4,7,"Waldrop\nStadium"\n';
  const one = parseScheduleSheet(wrapped, teams);
  check("a cell spanning two lines stays one row", one.games.length === 1, `${one.games.length}`);
  check("with both schools intact", one.games[0]?.home.name === "Homewood");
  check(
    "and the same is true of the tab-separated form",
    parseScheduleSheet(
      wrapped.replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g, "\t"),
      teams,
    ).games.length === 1,
  );
}

console.log("\n12. The layout comes from the header, not from habit");
{
  // Insert a column before HOME and the reader should follow it. Fixed
  // offsets would put every school one cell to the left.
  const shifted = csv
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `,${line}` : line))
    .join("\n");
  const moved = parseScheduleSheet(shifted, teams);
  check(
    "an inserted column shifts the layout",
    moved.games.length === report.games.length,
    `${moved.games.length} games, ${moved.skipped.length} skipped`,
  );
  const g = moved.games.find((x) => x.home.name === "Spain Park");
  check("and the scores still land correctly", g?.homeScore === 14 && g?.awayScore === 48);
}

console.log("\n13. A sheet of results is not turned into a schedule of zeros");
{
  const games = toGames(report, 3);
  const played = games.filter((g) => g.status === "final");
  check(`190 finals out of 192 rows`, played.length === 190, `${played.length}`);
  check(
    "no final has a null score",
    played.every((g) => g.s1 !== null && g.s2 !== null),
  );
  check("week and type are carried through", games.every((g) => g.week === 3 && g.type === "regular"));
}

console.log(
  failures === 0
    ? "\nThe spreadsheet reads.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
