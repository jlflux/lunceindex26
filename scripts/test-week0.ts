/**
 * Week 0 sanity, against the real roster and the real preseason ratings.
 *
 * The engine's unit tests run on synthetic fields, and the shape of the field
 * turns out to matter: how far a schedule bonus can push a team depends on the
 * spread of everybody else's SOS, which a dozen invented teams do not
 * reproduce. Both week-0 anomalies that reached the published site — a good
 * team collapsing on one loss, and another team's rating rising after being
 * beaten by three scores — looked fine in a toy field.
 *
 * So this checks the two of them against 393 real teams and real priors.
 *
 * Usage: npx tsx scripts/test-week0.ts
 */
import { readFileSync } from "node:fs";
import { computeRatings } from "../src/lib/engine";
import { parseCsvText } from "../src/lib/csv";
import { loadRosterCsv } from "../src/lib/roster-csv";
import { DEFAULT_CONFIG, type Game } from "../src/lib/types";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function roster() {
  const teams = loadRosterCsv("data/AHSAA_Class_List_2026.csv");
  const rows = parseCsvText(
    readFileSync("data/alpreps_preseason_2026.csv", "utf8"),
  );
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const iName = head.indexOf("team");
  const iRating = head.indexOf("rating");
  const priors = new Map(
    rows.slice(1).map((r) => [r[iName].trim(), Number(r[iRating])]),
  );
  for (const t of teams) {
    const p = priors.get(t.name);
    if (p !== undefined) t.preseason_prior = p;
  }
  return teams;
}

const g = (t1: string, s1: number, t2: string, s2: number): Game => ({
  t1,
  s1,
  t2,
  s2,
  week: 0,
  type: "regular",
  round: null,
  date: null,
  status: "final",
});

const teams = roster();
const prior = (n: string) =>
  teams.find((t) => t.name === n)!.preseason_prior as number;

console.log("\n1. A heavy loss to a strong opponent does not raise a rating");
{
  // Parker, 23.85, beaten by three scores by the strongest side on the board.
  // Published at 40.9 — the schedule bonus outweighed the defeat, because
  // after one game SOS is simply that one opponent's rating.
  const res = computeRatings(teams, [g("Thompson", 42, "Parker", 21)]);
  const p = res.ratings.find((r) => r.name === "Parker")!;
  check(
    "Parker does not gain from losing by 21",
    p.rating <= prior("Parker"),
    `prior ${prior("Parker")} → ${p.rating.toFixed(2)}`,
  );
  check(
    "but a hard schedule still softens it",
    p.rating > prior("Parker") - 6,
    `prior ${prior("Parker")} → ${p.rating.toFixed(2)}`,
  );
}

console.log("\n2. One loss does not collapse a good team");
{
  // St. Michael, 23.95, beaten badly by an out-of-state opponent — which the
  // engine can only value at the field mean. Published at -16.8, 306th.
  const res = computeRatings(teams, [g("Away Academy GA", 31, "St. Michael", 3)]);
  const s = res.ratings.find((r) => r.name === "St. Michael")!;
  check(
    "St. Michael stays in the top half",
    s.rank < teams.length / 2,
    `rating ${s.rating.toFixed(2)}, rank ${s.rank}`,
  );
  check(
    "and still pays for the loss",
    s.rating < prior("St. Michael"),
    `prior ${prior("St. Michael")} → ${s.rating.toFixed(2)}`,
  );
}

console.log("\n3. Nobody moves before a game is played");
{
  const res = computeRatings(teams, []);
  const worst = res.ratings.reduce((m, r) => {
    const p = teams.find((t) => t.name === r.name)!.preseason_prior;
    return p === null ? m : Math.max(m, Math.abs(r.rating - p));
  }, 0);
  check(
    "every rating equals its preseason value",
    worst < 1e-9,
    `worst drift ${worst}`,
  );
}

console.log(
  failures === 0
    ? "\nWeek 0 behaves against the real field.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
