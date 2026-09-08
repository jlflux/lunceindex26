/**
 * Generates a ratings payload from the local CSVs and the Week 0 PDF, so the
 * UI can be rendered and reviewed without a database.
 *
 * Usage: npx tsx scripts/make-preview.ts [--played] [--season]
 *   --played  invent deterministic results, to preview records, efficiency
 *             columns and result labels
 *   --season  invent the rest of the fixtures too, so a team profile has a
 *             full schedule rather than the single Week 0 game
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { computeRatings } from "../src/lib/engine";
import { parseCsvText } from "../src/lib/csv";
import { loadRosterCsv } from "../src/lib/roster-csv";
import { parseSchedulePdf, toGames } from "../src/lib/schedule-pdf";
import {
  DEFAULT_CONFIG,
  type Game,
  type PlayoffRound,
  type RatingsPayload,
  type Team,
} from "../src/lib/types";

/**
 * Invents the rest of a season so the design can be reviewed against a full
 * board: regional opponents through week 10, then four playoff rounds for the
 * strongest eight teams in each classification.
 *
 * Preview only, and never near the database — the real schedule comes from
 * the AHSAA sheets. This exists because a panel showing one game says nothing
 * about how a panel showing fourteen reads.
 */
function inventSeason(teams: Team[], existing: Game[]): Game[] {
  const taken = new Set(
    existing.map((g) => [g.t1, g.t2].sort().join("|")),
  );
  const out: Game[] = [];

  const byRegion = new Map<string, Team[]>();
  for (const t of teams) {
    const k = `${t.classification}-${t.region}`;
    byRegion.set(k, [...(byRegion.get(k) ?? []), t]);
  }

  for (const pool of byRegion.values()) {
    // Round-robin within the region, one fixture per team per week.
    const list = [...pool];
    if (list.length % 2) list.push(null as unknown as Team);
    const n = list.length;
    for (let week = 1; week <= Math.min(10, n - 1); week++) {
      for (let i = 0; i < n / 2; i++) {
        const a = list[i];
        const b = list[n - 1 - i];
        if (!a || !b) continue;
        const key = [a.name, b.name].sort().join("|");
        if (taken.has(key)) continue;
        taken.add(key);
        // Alternate the host so home advantage is not always the same side.
        const home = week % 2 === 0 ? a : b;
        const away = home === a ? b : a;
        out.push({
          t1: home.name,
          t2: away.name,
          s1: null,
          s2: null,
          week,
          type: "regular",
          round: null,
          date: null,
          status: "scheduled",
        });
      }
      // Rotate all but the first, the standard circle method.
      list.splice(1, 0, list.pop() as Team);
    }
  }

  // Playoffs: the eight strongest in each class, seeded by prior, halving
  // each round. Enough to exercise the round labels on a profile.
  const byClass = new Map<string, Team[]>();
  for (const t of teams) {
    byClass.set(t.classification, [...(byClass.get(t.classification) ?? []), t]);
  }
  for (const pool of byClass.values()) {
    let bracket = [...pool]
      .sort((a, b) => (b.preseason_prior ?? 0) - (a.preseason_prior ?? 0))
      .slice(0, 8);
    for (let round = 1; bracket.length > 1 && round <= 4; round++) {
      const winners: Team[] = [];
      for (let i = 0; i < bracket.length; i += 2) {
        const home = bracket[i];
        const away = bracket[i + 1];
        if (!away) {
          winners.push(home);
          continue;
        }
        out.push({
          t1: home.name,
          t2: away.name,
          s1: null,
          s2: null,
          week: 10 + round,
          type: "playoff",
          round: `r${round}` as PlayoffRound,
          date: null,
          status: "scheduled",
        });
        winners.push(home); // higher seed advances
      }
      bracket = winners;
    }
  }

  return out;
}

async function main() {
  const withResults = process.argv.includes("--played");
  const fullSeason = process.argv.includes("--season");

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

  if (fullSeason) {
    games = [...games, ...inventSeason(teams, games)];
  }

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
