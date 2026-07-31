/**
 * Seeds teams, aliases and config into Supabase.
 *
 * Usage:
 *   npm run seed
 *   npm run seed -- --priors data/preseason_priors.csv
 *
 * Idempotent: teams are upserted by name, so re-running updates classification
 * and region without touching games or scores.
 *
 * The priors CSV needs a team-name column and a rating column. Accepted
 * headers: Team/Name/School, and Rating/Prior/Preseason_Prior/Final.
 */
import { readFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { serviceClient } from "../src/lib/db";
import { ALIASES, slugify } from "../src/lib/names";
import { loadRosterCsv, parseCsv } from "../src/lib/roster-csv";
import { DEFAULT_CONFIG } from "../src/lib/types";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Reads a priors CSV into name → { rating, source }. */
function loadPriors(path: string): Map<string, { rating: number; source: string }> {
  const rows = parseCsv(readFileSync(path, "utf8"));
  const header = rows[0].map((h) => h.trim().toLowerCase());

  const iName = header.findIndex((h) =>
    ["team", "name", "school"].includes(h),
  );
  const iRating = header.findIndex((h) =>
    ["rating", "prior", "preseason_prior", "preseason prior", "final"].includes(h),
  );
  const iSource = header.findIndex((h) =>
    ["prior_source", "source", "2025 team", "prior source"].includes(h),
  );

  if (iName < 0 || iRating < 0) {
    throw new Error(
      `Priors CSV needs a name column and a rating column. Got: ${rows[0].join(", ")}`,
    );
  }

  const out = new Map<string, { rating: number; source: string }>();
  for (const r of rows.slice(1)) {
    const name = (r[iName] ?? "").trim();
    const rating = Number((r[iRating] ?? "").trim());
    if (!name || !Number.isFinite(rating)) continue;
    out.set(name, {
      rating,
      source: (iSource >= 0 ? r[iSource] : "")?.trim() || name,
    });
  }
  return out;
}

async function main() {
  const rosterPath = arg("--roster") ?? "data/AHSAA_Class_List_2026.csv";
  const priorsPath = arg("--priors");

  const teams = loadRosterCsv(rosterPath);
  console.log(`Roster: ${teams.length} teams from ${rosterPath}`);

  const byClass = new Map<string, number>();
  for (const t of teams) {
    byClass.set(t.classification, (byClass.get(t.classification) ?? 0) + 1);
  }
  console.log("By classification:", Object.fromEntries(byClass));

  // Attach priors, reporting anything that does not line up.
  if (priorsPath) {
    const priors = loadPriors(priorsPath);
    console.log(`Priors: ${priors.size} rows from ${priorsPath}`);

    const rosterNames = new Set(teams.map((t) => t.name));
    let matched = 0;
    for (const t of teams) {
      const p = priors.get(t.name);
      if (p) {
        t.preseason_prior = p.rating;
        t.prior_source = p.source;
        matched++;
      }
    }
    const unusedPriors = [...priors.keys()].filter((n) => !rosterNames.has(n));
    const missingPriors = teams.filter((t) => t.preseason_prior === null);

    console.log(`  matched ${matched} / ${teams.length} teams`);
    if (unusedPriors.length) {
      console.log(
        `  ${unusedPriors.length} prior rows matched no roster team:\n` +
          unusedPriors.map((n) => `    ${n}`).join("\n"),
      );
    }
    if (missingPriors.length) {
      console.log(
        `  ${missingPriors.length} teams have no prior (they seed from their class baseline):\n` +
          missingPriors.map((t) => `    ${t.name} (${t.classification})`).join("\n"),
      );
    }
  } else {
    console.log(
      "No --priors given: every team seeds from its class baseline alone.",
    );
  }

  const db = serviceClient();

  const { error: teamErr } = await db
    .from("teams")
    .upsert(
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
  if (teamErr) throw new Error(`Seeding teams: ${teamErr.message}`);
  console.log(`Upserted ${teams.length} teams.`);

  // Seed the shipped alias table so PDF imports resolve on a fresh database.
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
  if (aliasErr) throw new Error(`Seeding aliases: ${aliasErr.message}`);
  console.log(`Upserted ${aliasRows.length} aliases.`);

  const skippedAliases = Object.entries(ALIASES).filter(
    ([, c]) => !idByName.has(c),
  );
  if (skippedAliases.length) {
    console.log(
      `  ${skippedAliases.length} aliases point at names not in the roster:\n` +
        skippedAliases.map(([a, c]) => `    "${a}" → "${c}"`).join("\n"),
    );
  }

  // Only write config if none exists — never clobber tuned sliders.
  const { data: existing } = await db
    .from("config")
    .select("id")
    .eq("id", 1)
    .maybeSingle();
  if (!existing) {
    const { error } = await db.from("config").insert({ id: 1, data: DEFAULT_CONFIG });
    if (error) throw new Error(`Seeding config: ${error.message}`);
    console.log("Wrote default config.");
  } else {
    console.log("Config already present — left untouched.");
  }

  console.log("\nSeed complete.");
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
