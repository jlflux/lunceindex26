/**
 * Parses a saved ahsfhs.org team page and reports what it found, including
 * how each opponent resolves against the roster.
 * Usage: npx tsx scripts/test-ahsfhs.ts <file.html>
 */
import { readFileSync } from "node:fs";
import { parseAhsfhsTeamPage } from "../src/lib/ahsfhs";
import { buildIndex, matchTeam } from "../src/lib/names";
import { loadRosterCsv } from "../src/lib/roster-csv";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/test-ahsfhs.ts <file.html>");
  process.exit(1);
}

const page = parseAhsfhsTeamPage(readFileSync(file, "utf8"));
console.log(`Team: ${page.team}   Season: ${page.season}`);
console.log(`Games: ${page.games.length}   Skipped: ${page.skipped.length}\n`);

const teams = loadRosterCsv("data/AHSAA_Class_List_2026.csv");
const index = buildIndex(teams);

console.log("Wk  Date   H/A  Opponent                  → roster match");
console.log("─".repeat(72));
for (const g of page.games) {
  const m = matchTeam({ raw: g.opponentRaw }, index);
  const resolved = m.outOfState
    ? `${m.name}  [non-AHSAA]`
    : (m.name ?? "*** NO MATCH ***");
  console.log(
    `${String(g.week ?? "?").padStart(2)}  ` +
      `${g.dateLabel.padEnd(6)} ${(g.isHome ? "home" : "away").padEnd(5)}` +
      `${g.opponentRaw.padEnd(26)}${resolved}` +
      `${g.regionGame ? "  (region)" : ""}` +
      `${g.result ? `  ${g.result} ${g.teamScore}-${g.oppScore}` : ""}`,
  );
}
for (const s of page.skipped) console.log(`skipped: ${s.reason} — ${s.text}`);
