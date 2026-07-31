/**
 * End-to-end check with no database: roster CSV → schedule PDF → rating
 * engine. Confirms the pieces fit together and that a preseason board (no
 * scores entered) behaves the way it should.
 *
 * Usage: npx tsx scripts/smoke.ts
 */
import { readFileSync } from "node:fs";
import { computeRatings } from "../src/lib/engine";
import { loadRosterCsv } from "../src/lib/roster-csv";
import { parseSchedulePdf, toGames } from "../src/lib/schedule-pdf";
import { buildTeamView } from "../src/lib/team-view";
import { DEFAULT_CONFIG, type RatingsPayload } from "../src/lib/types";

async function main() {
  const teams = loadRosterCsv("data/AHSAA_Class_List_2026.csv");
  console.log(`Teams: ${teams.length}`);

  const report = await parseSchedulePdf(
    new Uint8Array(readFileSync("data/2026_Week_0_Football.pdf")),
    teams,
  );
  const games = toGames(report, 0);
  console.log(`Week 0 games: ${games.length}`);

  // --- Preseason: schedule loaded, nothing played ------------------------
  const pre = computeRatings(teams, games, DEFAULT_CONFIG);
  console.log(
    `\nPreseason — prior blend ${pre.priorBlend}, max week played ${pre.maxWeekPlayed}`,
  );
  const anyRecord = pre.ratings.some((r) => r.wins || r.losses);
  console.log(
    anyRecord
      ? "  FAIL: a scheduled game produced a record"
      : "  ok   scheduled games leave every record at 0-0",
  );

  // With no priors loaded, every team sits on its class baseline, so the
  // board should be ordered strictly by classification.
  const top = pre.ratings[0];
  console.log(
    `  top of board: ${top.name} (${top.classification}) ${top.rating.toFixed(2)}`,
  );
  console.log(
    top.classification === "6A"
      ? "  ok   class baselines put 6A on top before any games"
      : `  FAIL: expected a 6A team on top, got ${top.classification}`,
  );

  // --- Play the week ------------------------------------------------------
  // Deterministic pseudo-results so the run is reproducible.
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const played = games.map((g) => ({
    ...g,
    s1: Math.floor(rand() * 42),
    s2: Math.floor(rand() * 42),
  }));

  const post = computeRatings(teams, played, DEFAULT_CONFIG);
  const withGames = post.ratings.filter((r) => r.wins + r.losses > 0).length;
  console.log(`\nAfter week 0 — ${withGames} teams have a result`);
  console.log(
    post.maxWeekPlayed === 0 && post.priorBlend === 1
      ? "  ok   week 0 keeps preseason carry-over at 100%"
      : `  FAIL: blend ${post.priorBlend} at week ${post.maxWeekPlayed}`,
  );

  const totalW = post.ratings.reduce((a, r) => a + r.wins, 0);
  const totalL = post.ratings.reduce((a, r) => a + r.losses, 0);
  console.log(`  record totals: ${totalW}W / ${totalL}L across the field`);

  // --- Team page assembly -------------------------------------------------
  const payload: RatingsPayload = {
    generated: new Date().toISOString(),
    config: DEFAULT_CONFIG,
    ratings: post.ratings,
    rpi: post.rpi,
    games: played,
    max_week_played: post.maxWeekPlayed,
    prior_blend: post.priorBlend,
  };

  const sample = post.ratings.find((r) => r.wins + r.losses > 0)!;
  const view = buildTeamView(payload, sample.slug);
  if (!view) {
    console.log("  FAIL: could not build a team view");
    process.exit(1);
  }
  const e = view.schedule[0];
  console.log(
    `\nTeam page — ${view.rating.name} (${view.rating.wins}-${view.rating.losses}), ` +
      `${view.schedule.length} game(s) on schedule`,
  );
  console.log(
    `  vs ${e.opponent}: ${e.teamScore}-${e.oppScore}, ` +
      `projected ${e.expected?.toFixed(1) ?? "n/a"}, ${e.performance ?? "n/a"}`,
  );
  console.log(
    e.performance
      ? "  ok   result classified against its projection"
      : "  note opponent unrated, so no projection (expected for non-AHSAA)",
  );

  // Out-of-state opponents must appear on schedules without being ranked.
  const oosNames = new Set(
    report.games
      .filter((g) => g.away.outOfState)
      .map((g) => g.away.name as string),
  );
  const leaked = post.ratings.filter((r) => oosNames.has(r.name));
  console.log(
    leaked.length === 0
      ? `\n  ok   ${oosNames.size} non-AHSAA opponents stayed out of the rankings`
      : `\n  FAIL: ${leaked.length} non-AHSAA schools appear in the rankings`,
  );

  console.log("\nSmoke test complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
