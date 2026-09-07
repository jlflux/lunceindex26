/**
 * Reproduces the live board from an exported season, so formula changes can be
 * measured instead of guessed at.
 *
 * Needs data/alpreps_games_wk2.csv — the Admin → Games "Export all games" file.
 *
 * Usage: npx tsx scripts/tune.ts [team ...]
 */
import { readFileSync } from "node:fs";
import { computeRatings } from "../src/lib/engine";
import { parseCsvText } from "../src/lib/csv";
import { loadRosterCsv } from "../src/lib/roster-csv";
import {
  DEFAULT_CONFIG,
  type EngineConfig,
  type Game,
  type Team,
} from "../src/lib/types";

export const GAMES_CSV = "data/alpreps_games_wk2.csv";

export function roster(): Team[] {
  const teams = loadRosterCsv("data/AHSAA_Class_List_2026.csv");
  const rows = parseCsvText(
    readFileSync("data/alpreps_preseason_2026.csv", "utf8"),
  );
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const iN = h.indexOf("team");
  const iR = h.indexOf("rating");
  const priors = new Map(
    rows.slice(1).map((r) => [r[iN].trim(), Number(r[iR])]),
  );
  for (const t of teams) {
    const p = priors.get(t.name);
    if (p !== undefined) t.preseason_prior = p;
  }
  return teams;
}

export function games(): Game[] {
  const rows = parseCsvText(readFileSync(GAMES_CSV, "utf8"));
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const c = (n: string) => h.indexOf(n);
  const num = (v: string) => (v === "" || v === undefined ? null : Number(v));
  return rows
    .slice(1)
    .filter((r) => r[c("home")])
    .map((r) => ({
      t1: r[c("home")].trim(),
      s1: num(r[c("home_score")]),
      t2: r[c("away")].trim(),
      s2: num(r[c("away_score")]),
      week: Number(r[c("week")]),
      type: (r[c("type")] || "regular") as "regular" | "playoff",
      round: (r[c("round")] || null) as Game["round"],
      date: r[c("date")] || null,
      status: r[c("status")] || null,
    }));
}

export function board(cfg: Partial<EngineConfig> = {}) {
  return computeRatings(roster(), games(), { ...DEFAULT_CONFIG, ...cfg });
}

if (require.main === module) {
  const wanted = process.argv.slice(2);
  const res = board();
  const G = games().filter((g) => g.s1 !== null);

  const show = wanted.length
    ? res.ratings.filter((r) => wanted.includes(r.name))
    : res.ratings.slice(0, 15);

  console.log(
    `\n${res.ratings.length} teams · ${G.length} played · max week ${res.maxWeekPlayed} · prior blend ${res.priorBlend}\n`,
  );
  for (const r of show) {
    console.log(
      `#${String(r.rank).padStart(3)}  ${r.name.padEnd(22)} ${r.classification.padEnd(3)} ` +
        `${r.rating.toFixed(2).padStart(7)}  massey ${r.massey.toFixed(2).padStart(7)}  ` +
        `sos ${r.sos.toFixed(1).padStart(6)}  ${r.wins}-${r.losses}`,
    );
    for (const g of G.filter((x) => x.t1 === r.name || x.t2 === r.name)) {
      const home = g.t1 === r.name;
      const us = home ? (g.s1 as number) : (g.s2 as number);
      const them = home ? (g.s2 as number) : (g.s1 as number);
      const opp = home ? g.t2 : g.t1;
      const oppRow = res.ratings.find((x) => x.name === opp);
      console.log(
        `        wk${g.week} ${us > them ? "W" : "L"} ${String(us).padStart(2)}-${String(them).padStart(2)} ` +
          `${home ? "vs" : "at"} ${opp.padEnd(22)} ${
            oppRow ? `#${oppRow.rank} (${oppRow.rating.toFixed(1)})` : "out-of-state"
          }`,
      );
    }
  }
}
