/**
 * Runs the schedule parser against a real AHSAA PDF and prints a report.
 * Usage: npx tsx scripts/test-parse.ts data/2026_Week_0_Football.pdf
 */
import { readFileSync } from "node:fs";
import { loadRosterCsv } from "../src/lib/roster-csv";
import { parseSchedulePdf } from "../src/lib/schedule-pdf";

async function main() {
  const pdfPath = process.argv[2] ?? "data/2026_Week_0_Football.pdf";
  const teams = loadRosterCsv("data/AHSAA_Class_List_2026.csv");
  console.log(`Roster: ${teams.length} teams`);

  const report = await parseSchedulePdf(
    new Uint8Array(readFileSync(pdfPath)),
    teams,
  );

  console.log(
    `\nRows seen: ${report.totalRows}` +
      `\nGames parsed: ${report.games.length}` +
      `\nDuplicates collapsed: ${report.duplicates.length}` +
      `\nSkipped: ${report.skipped.length}` +
      `\nWarnings: ${report.warnings.length}`,
  );

  const oos = report.games.filter(
    (g) => g.home.outOfState || g.away.outOfState,
  );
  console.log(`Out-of-state matchups: ${oos.length}`);

  const byMethod = new Map<string, number>();
  for (const g of report.games) {
    for (const m of [g.home, g.away]) {
      byMethod.set(m.method, (byMethod.get(m.method) ?? 0) + 1);
    }
  }
  console.log("\nMatch methods:", Object.fromEntries(byMethod));

  if (report.warnings.length) {
    console.log("\n-- warnings --");
    for (const w of report.warnings) console.log("  " + w);
  }
  if (report.duplicates.length) {
    console.log("\n-- duplicates --");
    for (const d of report.duplicates) console.log("  " + d);
  }
  if (report.skipped.length) {
    console.log("\n-- skipped --");
    for (const s of report.skipped) {
      console.log(`  ${s.reason}\n     ${s.line.slice(0, 120)}`);
    }
  }

  console.log("\n-- first 8 games --");
  for (const g of report.games.slice(0, 8)) {
    console.log(
      `  ${g.date}  ${g.home.name} vs ${g.away.name}` +
        `${g.away.outOfState ? "  [OOS]" : ""}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
