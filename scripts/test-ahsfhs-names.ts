/**
 * Checks the ahsfhs.org spelling candidates.
 *
 * Every entry in this list drives a real HTTP request during an import, so
 * both halves matter: the right spelling has to be in there, and the list has
 * to stay short.
 */
import { readFileSync } from "node:fs";
import {
  AHSFHS_NAMES,
  ahsfhsCandidates,
  ahsfhsNamesFor,
  ahsfhsUrl,
  parseAhsfhsTeamPage,
} from "../src/lib/ahsfhs";
import { buildIndex, matchTeam } from "../src/lib/names";
import { loadRosterCsv } from "../src/lib/roster-csv";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Roster spelling → the spelling ahsfhs.org actually files it under. */
const KNOWN: [string, string][] = [
  // Initials written out with periods on their side.
  ["BB Comer", "B.B. Comer"],
  ["GW Long", "G.W. Long"],
  ["TR Miller", "T.R. Miller"],
  ["JF Shields", "J.F. Shields"],
  // Our hyphen disambiguator is a plain space over there.
  ["Carver-Montgomery", "Carver Montgomery"],
  ["Central-Phenix City", "Central Phenix City"],
  ["Hillcrest-Tuscaloosa", "Hillcrest Tuscaloosa"],
  // Apostrophe dropped.
  ["St. Paul's", "St. Pauls"],
  // Genuinely different name, so the explicit map has to carry it.
  ["Dothan", "Dothan High"],
  ["Montgomery Catholic", "Catholic Montgomery"],
  ["Hope Christian", "Hope Christian Academy"],
  // All-caps names, which have no space to key the expansion off.
  ["DAR", "D.A.R."],
  // The roster drops a trailing word that ahsfhs.org keeps.
  ["Lee-Scott", "Lee-Scott Academy"],
  ["Northside Methodist", "Northside Methodist Academy"],
  ["University Charter", "University Charter School"],
];

console.log("\n1. The spelling ahsfhs.org uses is among the candidates");
for (const [roster, source] of KNOWN) {
  const list = ahsfhsCandidates(roster);
  check(
    `${roster} → ${source}`,
    list.includes(source),
    `got ${list.map((c) => `"${c}"`).join(", ")}`,
  );
}

console.log("\n2. What we already believe is tried first");
{
  const overridden = Object.keys(AHSFHS_NAMES);
  check(
    "an unmapped team leads with its roster name",
    ahsfhsCandidates("Thompson")[0] === "Thompson",
  );
  check(
    "a mapped team leads with the mapped name",
    overridden.every((r) => ahsfhsCandidates(r)[0] === ahsfhsNamesFor(r)[0]),
  );
  check(
    // Their "Dothan" page is a different, older program.
    "a mapped team never falls back to its roster name",
    overridden.every((r) => !ahsfhsCandidates(r).includes(r)),
  );
  check(
    "a team with no punctuation costs one request",
    ahsfhsCandidates("Hoover").length === 1,
  );
}

console.log("\n3. The whole roster stays within budget");
{
  const teams = loadRosterCsv("data/AHSAA_Class_List_2026.csv");
  const worst = teams
    .map((t) => ({ name: t.name, n: ahsfhsCandidates(t.name).length }))
    .sort((a, b) => b.n - a.n);
  const empty = teams.filter((t) => ahsfhsCandidates(t.name).length === 0);

  check("every team produces at least one candidate", empty.length === 0);
  check(
    "no team exceeds six candidates",
    worst[0].n <= 6,
    `${worst[0].name} has ${worst[0].n}`,
  );

  const total = teams.reduce((s, t) => s + ahsfhsCandidates(t.name).length, 0);
  console.log(
    `       ${teams.length} teams · ${total} candidates · worst: ${worst[0].name} (${worst[0].n})`,
  );
}

console.log("\n4. Their spelling still resolves back to our roster");
{
  // The fetch checks the page it landed on against the roster, so a candidate
  // that works has to match back — otherwise a correct page gets rejected.
  const teams = loadRosterCsv("data/AHSAA_Class_List_2026.csv");
  const index = buildIndex(teams);
  for (const [roster, source] of KNOWN) {
    const m = matchTeam({ raw: source }, index);
    check(
      `"${source}" resolves to ${roster}`,
      m.name === roster,
      `got ${m.name ?? "no match"}`,
    );
  }
}

console.log("\n5. Names cut off at 20 characters still resolve");
{
  const teams = loadRosterCsv("data/AHSAA_Class_List_2026.csv");
  const index = buildIndex(teams);
  // Exactly what came back in the import log — the opponent column on
  // ahsfhs.org is 20 characters wide.
  const cut: [string, string][] = [
    ["Lindsay Lane Christi", "Lindsay Lane"],
    ["West End Walnut Grov", "West End"],
    ["Hope Christian Acade", "Hope Christian"],
    ["Alabama Aerospace an", "Alabama Aerospace and Aviation"],
  ];
  for (const [raw, expected] of cut) {
    check(
      `"${raw}" → ${expected}`,
      matchTeam({ raw }, index).name === expected,
      `got ${matchTeam({ raw }, index).name ?? "no match"}`,
    );
  }

  // The rule only fires on strings long enough to have been cut, and only
  // when one team fits — a short prefix like "Central" must stay unmatched.
  check(
    "a short ambiguous name is not force-matched",
    matchTeam({ raw: "Central" }, index).method !== "truncated",
  );
}

console.log("\n6. A page is identified by its own team, not its first opponent");
{
  // Abbeville's page, in the shape that broke the import: the schedule's
  // first opponent link comes before anything self-referential.
  const html = `
    <html><head><title>Abbeville High School Football History</title></head>
    <body>
      <table><tr><td class="colorbar">2026 Season</td></tr>
      <tr><td class="smcenter">8/21</td>
          <td class="smleft">@ <a href="teampage.asp?year=&Team=Headland">Headland</a></td></tr>
      </table>
      <a href="Printschedule2.asp?year=2026&team=Abbeville">Print</a>
    </body></html>`;
  const page = parseAhsfhsTeamPage(html);
  check("reads Abbeville, not Headland", page.team === "Abbeville", `got ${page.team}`);
  check("still finds the schedule", page.games.length === 1);
  check("and the opponent", page.games[0]?.opponentRaw === "Headland");

  // With no print link, the title carries it.
  const noPrint = parseAhsfhsTeamPage(html.replace(/<a href="Print[^<]+<\/a>/, ""));
  check("falls back to the title", noPrint.team === "Abbeville", `got ${noPrint.team}`);
}

console.log("\n7. A heading inside the schedule does not truncate it");
{
  // The failure this guards: the slice used to stop at the very next heading,
  // so anything the site drops in mid-table cut the schedule off there. A cut
  // after the opener leaves exactly one game per team — a whole roster's
  // worth of week-0-only fixtures, which is what it looked like in practice.
  const row = (date: string, opp: string) =>
    `<tr><td class="smcenter">${date}</td><td class="smleft">vs. ${opp}</td></tr>`;

  const page = (interruption: string) => `
    <html><head><title>Fairhope High School Football History</title></head><body>
    <table><tr><td class="colorbar">2026 Season</td></tr>
    ${row("8/21", "Pace")}
    ${interruption}
    ${row("8/28", "Baldwin County")}
    ${row("9/4", "Foley")}
    </table>
    <table><tr><td class="colorbar">2026 Season Totals</td></tr>
    <tr><td class="smcenter">9/11</td><td class="smleft">vs. Not A Real Game</td></tr>
    </table></body></html>`;

  const clean = parseAhsfhsTeamPage(page(""));
  check("all three games without an interruption", clean.games.length === 3);

  const promo = `<tr><td class="colorbar">Next Game</td></tr>`;
  const cut = parseAhsfhsTeamPage(page(promo));
  check(
    "all three games with one in the middle",
    cut.games.length === 3,
    `got ${cut.games.length}: ${cut.games.map((g) => g.dateLabel).join(", ")}`,
  );

  check(
    "and nothing from beyond the end marker",
    !cut.games.some((g) => g.opponentRaw.includes("Not A Real Game")),
  );
}

console.log("\n8. Both page layouts read the same schedule");
{
  // The team page and the games-by-year page disagree about date format and
  // about how the page names its own team. Both saved samples are Fairhope's
  // 2026 season, so both must produce the same ten games.
  const read = (file: string) =>
    parseAhsfhsTeamPage(readFileSync(file, "utf8"));

  const teamPage = read("data/samples/ahsfhs-fairhope.html");
  const byYear = read("data/samples/ahsfhs-fairhope-gamesbyyear.html");

  check("team page names its team", teamPage.team === "Fairhope");
  check(
    "games-by-year names its team",
    byYear.team === "Fairhope",
    // Its <title> is the site's own, identical on every page — reading that
    // would report every school in the state as "Alabama".
    `got ${byYear.team}`,
  );
  check("team page: ten games", teamPage.games.length === 10);
  check(
    "games-by-year: ten games",
    byYear.games.length === 10,
    `got ${byYear.games.length}`,
  );
  check(
    "same weeks either way",
    JSON.stringify(teamPage.games.map((g) => g.week)) ===
      JSON.stringify(byYear.games.map((g) => g.week)),
  );
  check(
    "same opponents either way",
    JSON.stringify(teamPage.games.map((g) => g.opponentRaw)) ===
      JSON.stringify(byYear.games.map((g) => g.opponentRaw)),
  );
  check(
    "same home/away either way",
    JSON.stringify(teamPage.games.map((g) => g.isHome)) ===
      JSON.stringify(byYear.games.map((g) => g.isHome)),
  );
}

console.log("\n9. Unclosed rows do not collapse the schedule");
{
  // Why this matters: a browser-saved page is a serialised DOM with every tag
  // balanced, because the browser repaired it on the way in. The bytes the
  // server sends need not close their rows. Grouping cells by <tr> then reads
  // the whole table as one row — one date cell, one game, for every team.
  //
  // Both saved samples are already repaired, so the raw shape is simulated by
  // stripping the row tags back out.
  for (const file of [
    "data/samples/ahsfhs-fairhope.html",
    "data/samples/ahsfhs-fairhope-gamesbyyear.html",
  ]) {
    const html = readFileSync(file, "utf8");
    const mangled = html.replace(/<\/tr>/gi, "");
    const page = parseAhsfhsTeamPage(mangled);
    check(
      `${file.split("/").pop()} survives losing its </tr> tags`,
      page.games.length === 10,
      `got ${page.games.length}`,
    );
  }

  // And a missing </td> costs its own cell, not the rest of the table.
  const noCells = readFileSync(
    "data/samples/ahsfhs-fairhope-gamesbyyear.html",
    "utf8",
  ).replace(/<\/td>/gi, "");
  check(
    "and losing its </td> tags",
    parseAhsfhsTeamPage(noCells).games.length === 10,
    `got ${parseAhsfhsTeamPage(noCells).games.length}`,
  );
}

console.log("\n10. The fetch asks for the games-by-year page");
{
  const url = ahsfhsUrl("Carver Montgomery");
  check("uses gamesbyyear.asp", url.includes("gamesbyyear.asp"), url);
  check("scopes to the season", url.includes("Year=2026"), url);
  check("encodes the name", url.includes("Carver%20Montgomery"), url);
}

console.log(
  failures === 0
    ? "\nCandidate spellings behave.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
