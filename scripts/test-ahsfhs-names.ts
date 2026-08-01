/**
 * Checks the ahsfhs.org spelling candidates.
 *
 * Every entry in this list drives a real HTTP request during an import, so
 * both halves matter: the right spelling has to be in there, and the list has
 * to stay short.
 */
import {
  AHSFHS_NAMES,
  ahsfhsCandidates,
  ahsfhsNamesFor,
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

console.log(
  failures === 0
    ? "\nCandidate spellings behave.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
