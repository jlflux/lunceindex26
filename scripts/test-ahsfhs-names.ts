/**
 * Checks the ahsfhs.org spelling candidates.
 *
 * Every entry in this list drives a real HTTP request during an import, so
 * both halves matter: the right spelling has to be in there, and the list has
 * to stay short.
 */
import { AHSFHS_NAMES, ahsfhsCandidates } from "../src/lib/ahsfhs";
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
    overridden.every(
      (r) => ahsfhsCandidates(r)[0] === AHSFHS_NAMES[r],
    ),
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

console.log(
  failures === 0
    ? "\nCandidate spellings behave.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
