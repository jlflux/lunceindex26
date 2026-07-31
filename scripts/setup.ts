/**
 * One-shot database setup: teams, preseason ratings, aliases, config, the
 * week schedules, and the first published ratings snapshot.
 *
 * Usage:
 *   npm run setup -- --dry-run    # report everything, write nothing
 *   npm run setup                 # actually write
 *
 * Idempotent. Safe to re-run: teams upsert by name, games upsert on their
 * natural key, and a game that already has scores is never overwritten.
 *
 * Deliberately does not import src/lib/data.ts — that module is marked
 * `server-only`, which throws outside a React server context.
 */
import { readFileSync, readdirSync } from "node:fs";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { parseCsvText } from "../src/lib/csv";
import { computeRatings } from "../src/lib/engine";
import { buildIndex, matchTeam, ALIASES } from "../src/lib/names";
import { loadRosterCsv } from "../src/lib/roster-csv";
import { parseSchedulePdf, toGames } from "../src/lib/schedule-pdf";
import {
  DEFAULT_CONFIG,
  type Game,
  type RatingsPayload,
  type Team,
} from "../src/lib/types";

const DRY = process.argv.includes("--dry-run");
const log = (s = "") => console.log(s);
const step = (n: number, s: string) => log(`\n${n}. ${s}\n${"─".repeat(52)}`);

/** Reads the priors CSV, matching names through the roster matcher. */
function attachPriors(teams: Team[]): { matched: number; unmatched: string[] } {
  const rows = parseCsvText(
    readFileSync("data/alpreps_preseason_2026.csv", "utf8"),
  );
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const iName = head.indexOf("team");
  const iRating = head.indexOf("rating");
  if (iName < 0 || iRating < 0) {
    throw new Error("Priors CSV needs Team and Rating columns.");
  }

  const index = buildIndex(teams);
  const byName = new Map(teams.map((t) => [t.name, t]));
  const unmatched: string[] = [];
  let matched = 0;

  for (const r of rows.slice(1)) {
    const raw = r[iName]?.trim();
    const rating = Number(r[iRating]);
    if (!raw || !Number.isFinite(rating)) continue;

    const m = matchTeam({ raw }, index);
    const team = m.name && !m.outOfState ? byName.get(m.name) : undefined;
    if (!team) {
      unmatched.push(raw);
      continue;
    }
    team.preseason_prior = rating;
    team.prior_source = raw;
    matched++;
  }
  return { matched, unmatched };
}

/** Finds every schedule PDF in data/ and derives its week from the filename. */
function schedulePdfs(): { path: string; week: number }[] {
  return readdirSync("data")
    .filter((f) => /week[_ ]?(\d+).*\.pdf$/i.test(f))
    .map((f) => ({
      path: `data/${f}`,
      week: Number(f.match(/week[_ ]?(\d+)/i)![1]),
    }))
    .sort((a, b) => a.week - b.week);
}

async function main() {
  log(DRY ? "DRY RUN — nothing will be written.\n" : "Writing to Supabase.\n");

  // ---- 1. roster + priors ------------------------------------------------
  step(1, "Teams and preseason ratings");
  const teams = loadRosterCsv("data/AHSAA_Class_List_2026.csv");

  const byClass = new Map<string, number>();
  for (const t of teams) {
    byClass.set(t.classification, (byClass.get(t.classification) ?? 0) + 1);
  }
  log(`Roster: ${teams.length} teams`);
  log(
    "  " +
      [...byClass.entries()]
        .sort()
        .map(([c, n]) => `${c}=${n}`)
        .join("  "),
  );

  const { matched, unmatched } = attachPriors(teams);
  log(`Preseason ratings matched: ${matched}/${teams.length}`);
  if (unmatched.length) {
    log(`  Unmatched prior rows (${unmatched.length}): ${unmatched.join(", ")}`);
  }
  const noPrior = teams.filter((t) => t.preseason_prior === null);
  if (noPrior.length) {
    log(
      `  Seeding from class baseline (${noPrior.length}): ` +
        noPrior.map((t) => `${t.name} (${t.classification})`).join(", "),
    );
  }

  // ---- 2. schedules ------------------------------------------------------
  step(2, "Schedules");
  const pdfs = schedulePdfs();
  let games: Game[] = [];

  for (const { path, week } of pdfs) {
    const report = await parseSchedulePdf(
      new Uint8Array(readFileSync(path)),
      teams,
    );
    const weekGames = toGames(report, week);
    games = games.concat(weekGames);

    log(
      `Week ${week}: ${report.totalRows} rows → ${weekGames.length} games ` +
        `(${report.duplicates.length} duplicates collapsed, ` +
        `${report.skipped.length} skipped)`,
    );
    for (const w of report.warnings) log(`  check: ${w}`);
    for (const s of report.skipped) log(`  skipped: ${s.reason}`);
  }
  if (!pdfs.length) log("No schedule PDFs found in data/.");

  // ---- 3. ratings --------------------------------------------------------
  step(3, "Ratings");
  const result = computeRatings(teams, games, DEFAULT_CONFIG);
  log(
    `Solved ${result.ratings.length} teams · ` +
      `prior blend ${result.priorBlend} · week ${result.maxWeekPlayed}`,
  );
  log("\nTop 10:");
  for (const r of result.ratings.slice(0, 10)) {
    log(
      `  ${String(r.rank).padStart(2)}  ${r.name.padEnd(22)} ` +
        `${r.classification.padEnd(3)} ${r.rating.toFixed(2).padStart(7)}`,
    );
  }

  if (DRY) {
    log("\nDry run complete — nothing written.\n");
    return;
  }

  // ---- 4. write ----------------------------------------------------------
  step(4, "Writing");
  const { serviceClient } = await import("../src/lib/db");
  const db = serviceClient();

  const { error: teamErr } = await db.from("teams").upsert(
    teams.map((t) => ({
      name: t.name,
      slug: t.slug,
      classification: t.classification,
      region: t.region,
      preseason_prior: t.preseason_prior,
      prior_source: t.prior_source,
    })),
    { onConflict: "name" },
  );
  if (teamErr) throw new Error(`teams: ${teamErr.message}`);
  log(`Teams upserted: ${teams.length}`);

  // Aliases, so schedule imports resolve PDF spellings on a fresh database.
  const { data: saved } = await db.from("teams").select("id, name");
  const idByName = new Map(
    ((saved ?? []) as { id: number; name: string }[]).map((r) => [r.name, r.id]),
  );
  const aliasRows = Object.entries(ALIASES)
    .filter(([, canonical]) => idByName.has(canonical))
    .map(([alias, canonical]) => ({
      alias,
      team_id: idByName.get(canonical) as number,
      source: "seed",
    }));
  const { error: aliasErr } = await db
    .from("team_aliases")
    .upsert(aliasRows, { onConflict: "alias" });
  if (aliasErr) throw new Error(`aliases: ${aliasErr.message}`);
  log(`Aliases upserted: ${aliasRows.length}`);

  // Never clobber a tuned config.
  const { data: existingCfg } = await db
    .from("config")
    .select("id")
    .eq("id", 1)
    .maybeSingle();
  if (existingCfg) {
    log("Config already present — left untouched.");
  } else {
    const { error } = await db
      .from("config")
      .insert({ id: 1, data: DEFAULT_CONFIG });
    if (error) throw new Error(`config: ${error.message}`);
    log("Config written.");
  }

  if (games.length) {
    // Leave any game that already has a result well alone.
    const { data: existing, error: readErr } = await db
      .from("games")
      .select("t1, t2, week, type, s1, s2");
    if (readErr) throw new Error(`games read: ${readErr.message}`);

    const played = new Set(
      ((existing ?? []) as Game[])
        .filter((g) => g.s1 !== null && g.s2 !== null)
        .map((g) => `${g.t1}|${g.t2}|${g.week}|${g.type}`),
    );
    const toWrite = games.filter(
      (g) => !played.has(`${g.t1}|${g.t2}|${g.week}|${g.type}`),
    );

    if (toWrite.length) {
      const { error } = await db
        .from("games")
        .upsert(toWrite, { onConflict: "t1,t2,week,type" });
      if (error) throw new Error(`games: ${error.message}`);
    }
    log(
      `Games upserted: ${toWrite.length}` +
        (games.length - toWrite.length
          ? ` (${games.length - toWrite.length} left alone — already scored)`
          : ""),
    );
  }

  // Recompute from what is actually in the database, not from memory, so the
  // snapshot reflects any results already entered.
  const { data: dbTeams } = await db.from("teams").select("*").order("name");
  const { data: dbGames } = await db.from("games").select("*").order("id");
  const { data: dbCfg } = await db
    .from("config")
    .select("data")
    .eq("id", 1)
    .maybeSingle();

  const cfg = { ...DEFAULT_CONFIG, ...((dbCfg?.data as object) ?? {}) };
  const final = computeRatings(
    (dbTeams ?? []) as Team[],
    (dbGames ?? []) as Game[],
    cfg,
  );

  const payload: RatingsPayload = {
    generated: new Date().toISOString(),
    config: cfg,
    ratings: final.ratings,
    rpi: final.rpi,
    games: (dbGames ?? []) as Game[],
    max_week_played: final.maxWeekPlayed,
    prior_blend: final.priorBlend,
  };

  const { error: snapErr } = await db
    .from("ratings_snapshot")
    .upsert({ id: 1, payload, generated: payload.generated });
  if (snapErr) throw new Error(`snapshot: ${snapErr.message}`);
  log(`Ratings published: ${payload.ratings.length} teams.`);

  log("\nSetup complete. The public site should now show the board.\n");
}

main().catch((e) => {
  console.error(`\nFailed: ${e.message}\n`);
  process.exit(1);
});
