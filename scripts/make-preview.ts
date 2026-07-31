/**
 * Generates a ratings payload from the local CSVs and the Week 0 PDF, so the
 * UI can be rendered and reviewed without a database.
 *
 * Usage: npx tsx scripts/make-preview.ts [--played]
 *   --played  invent deterministic Week 0 results, to preview records,
 *             efficiency columns and result labels
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { computeRatings } from "../src/lib/engine";
import { parseCsvText } from "../src/lib/csv";
import { loadRosterCsv } from "../src/lib/roster-csv";
import { parseSchedulePdf, toGames } from "../src/lib/schedule-pdf";
import { DEFAULT_CONFIG, type RatingsPayload } from "../src/lib/types";

async function main() {
  const withResults = process.argv.includes("--played");

  const teams = loadRosterCsv("data/AHSAA_Class_List_2026.csv");

  // Attach the real preseason priors.
  const priorRows = parseCsvText(
    readFileSync("data/alpreps_preseason_2026.csv", "utf8"),
  );
  const head = priorRows[0].map((h) => h.trim().toLowerCase());
  const iName = head.indexOf("team");
  const iRating = head.indexOf("rating");
  const priors = new Map<string, number>();
  for (const r of priorRows.slice(1)) {
    priors.set(r[iName].trim(), Number(r[iRating]));
  }
  let matched = 0;
  for (const t of teams) {
    const p = priors.get(t.name);
    if (p !== undefined) {
      t.preseason_prior = p;
      t.prior_source = t.name;
      matched++;
    }
  }
  console.log(`Priors attached: ${matched}/${teams.length}`);

  const report = await parseSchedulePdf(
    new Uint8Array(readFileSync("data/2026_Week_0_Football.pdf")),
    teams,
  );
  let games = toGames(report, 0);

  if (withResults) {
    let seed = 20260820;
    const rand = () =>
      (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const byName = new Map(teams.map((t) => [t.name, t]));
    games = games.map((g) => {
      // Bias scores by the rating gap so the preview looks like real football.
      const a = byName.get(g.t1)?.preseason_prior ?? 0;
      const b = byName.get(g.t2)?.preseason_prior ?? 0;
      const edge = (a - b) / 4;
      const base = 24 + rand() * 14;
      return {
        ...g,
        s1: Math.max(0, Math.round(base / 2 + edge / 2 + rand() * 10)),
        s2: Math.max(0, Math.round(base / 2 - edge / 2 + rand() * 10)),
      };
    });
  }

  const result = computeRatings(teams, games, DEFAULT_CONFIG);
  const payload: RatingsPayload = {
    generated: new Date().toISOString(),
    config: DEFAULT_CONFIG,
    ratings: result.ratings,
    rpi: result.rpi,
    games,
    max_week_played: result.maxWeekPlayed,
    prior_blend: result.priorBlend,
  };

  mkdirSync("scripts/out", { recursive: true });
  writeFileSync("scripts/out/preview.json", JSON.stringify(payload));

  console.log(
    `Wrote scripts/out/preview.json — ${payload.ratings.length} teams, ` +
      `${games.length} games${withResults ? " (with results)" : ""}`,
  );
  console.log("\nTop 10:");
  for (const r of payload.ratings.slice(0, 10)) {
    console.log(
      `  ${String(r.rank).padStart(2)}  ${r.name.padEnd(24)} ${r.classification.padEnd(3)} ` +
        `${r.rating.toFixed(2).padStart(7)}  ${r.wins}-${r.losses}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
