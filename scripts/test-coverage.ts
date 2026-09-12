/**
 * Checks the missing-week scan.
 *
 * The whole value of this check is its signal-to-noise. A version that flagged
 * every bye would be ignored within a week and would then fail to surface the
 * one fault it exists for, so most of what is tested here is what it declines
 * to report.
 *
 * Section 7 replays the actual Prattville fault, which is the case the scan
 * was written for.
 *
 * Usage: npx tsx scripts/test-coverage.ts
 */
import { findCoverage } from "../src/lib/coverage";
import type { Game } from "../src/lib/types";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

let nextId = 1;
const g = (
  t1: string,
  t2: string,
  week: number,
  type: "regular" | "playoff" = "regular",
): Game => ({
  id: nextId++,
  t1,
  s1: 21,
  t2,
  s2: 14,
  week,
  type,
  round: type === "playoff" ? "r1" : null,
  date: null,
  status: "final",
});

/** A field of `n` schools, every one of them playing in every listed week. */
function field(n: number, weeks: number[]): { roster: string[]; games: Game[] } {
  const roster = Array.from({ length: n }, (_, i) => `T${i + 1}`);
  const games: Game[] = [];
  for (const w of weeks) {
    for (let i = 0; i < n; i += 2) games.push(g(roster[i], roster[i + 1], w));
  }
  return { roster, games };
}

console.log("\n1. A complete schedule reports nobody");
{
  const { roster, games } = field(20, [1, 2, 3]);
  const r = findCoverage(games, roster);
  check("no suspects", r.suspect.length === 0);
  check("no byes", r.byes.length === 0);
  check("nobody absent", r.absent.length === 0);
  check("three complete weeks", r.completeWeeks === 3, `${r.completeWeeks}`);
  check("no week called thin", r.thin.length === 0);
}

console.log("\n2. A single open week is a bye, not an alarm");
{
  const { roster, games } = field(20, [1, 2, 3]);
  // Drop one week-2 fixture: both schools now have one open week.
  const without = games.filter((x) => !(x.week === 2 && x.t1 === "T1"));
  const r = findCoverage(without, roster);
  check("nobody is a suspect", r.suspect.length === 0, JSON.stringify(r.suspect));
  check("both are listed as byes", r.byes.length === 2, `${r.byes.length}`);
  check(
    "and the week is named",
    r.byes[0].missing.join() === "2",
    r.byes[0].missing.join(),
  );
  check("week 2 still counts as complete", r.thin.length === 0);
}

console.log("\n3. Two open weeks is the shape of a bad match");
{
  const { roster, games } = field(20, [1, 2, 3]);
  const without = games.filter(
    (x) => !((x.week === 2 || x.week === 3) && x.t1 === "T1"),
  );
  const r = findCoverage(without, roster);
  check("two suspects", r.suspect.length === 2, `${r.suspect.length}`);
  check("T1 among them", r.suspect.some((s) => s.team === "T1"));
  check(
    "both weeks named",
    r.suspect[0].missing.join() === "2,3",
    r.suspect[0].missing.join(),
  );
  check("and the games it does have are counted", r.suspect[0].played === 1);
  check("nobody is double-reported as a bye", r.byes.length === 0);
}

console.log("\n4. A short week is set aside, not blamed");
{
  // Week 0 is genuinely short every year: in 2026 it reached 68% of the roster
  // against a full week's 97%. Counting an absence from it as a fault would
  // flag a third of the state.
  const { roster, games } = field(40, [1, 2]);
  // Only six of the forty schools play in week 0.
  for (let i = 0; i < 6; i += 2) games.push(g(roster[i], roster[i + 1], 0));
  const r = findCoverage(games, roster);
  check("week 0 is marked thin", r.thin.join() === "0", r.thin.join());
  check("weeks 1 and 2 are not", r.completeWeeks === 2, `${r.completeWeeks}`);
  check(
    "and none of the 34 schools that sat it out is reported",
    r.suspect.length === 0 && r.byes.length === 0,
    `${r.suspect.length} suspect, ${r.byes.length} byes`,
  );
}

console.log("\n5. A half-finished import is called out as such");
{
  // The same rule that excuses week 0 is what catches an import that stopped
  // halfway: the week is reported as partial rather than producing one
  // complaint per school.
  const { roster, games } = field(40, [1, 2]);
  for (let i = 0; i < 14; i += 2) games.push(g(roster[i], roster[i + 1], 3));
  const r = findCoverage(games, roster);
  check("week 3 shows as thin", r.thin.join() === "3", r.thin.join());
  check(
    "rather than 26 schools missing a week",
    r.suspect.length === 0 && r.byes.length === 0,
    `${r.suspect.length + r.byes.length} reported`,
  );
  const wk3 = r.weeks.find((w) => w.week === 3);
  check("with its real numbers kept", wk3?.games === 7 && wk3?.teams === 14);
}

console.log("\n6. What the scan refuses to guess at");
{
  const { roster, games } = field(20, [1]);
  const r = findCoverage(games, roster);
  check(
    "one complete week proves nothing, so nothing is claimed",
    r.suspect.length === 0 && r.byes.length === 0 && r.absent.length === 0,
  );
  check("but the week is still reported", r.weeks.length === 1);

  // Playoffs eliminate most of the field by design.
  const { roster: r2, games: g2 } = field(20, [1, 2]);
  g2.push(g("T1", "T2", 12, "playoff"));
  const p = findCoverage(g2, r2);
  check(
    "playoff weeks are not part of the check",
    !p.weeks.some((w) => w.week === 12),
    p.weeks.map((w) => w.week).join(),
  );

  // Out-of-state opponents are stored by name but have no schedule here.
  const { roster: r3, games: g3 } = field(20, [1, 2]);
  g3.push(g("T1", "Niceville (FL)", 3));
  g3.push(g("T2", "Pace (FL)", 3));
  for (let i = 2; i < 20; i += 2) g3.push(g(r3[i], r3[i + 1], 3));
  const o = findCoverage(g3, r3);
  check(
    "an out-of-state opponent is never reported as missing a week",
    !o.suspect.some((s) => s.team.includes("FL")) &&
      !o.byes.some((s) => s.team.includes("FL")) &&
      !o.absent.some((s) => s.includes("FL")),
  );
}

console.log("\n7. The fault this was written for");
{
  // Prattville (6A) played weeks 1-3. Because "Prattville HS" resolved to
  // Prattville Christian (Single A), weeks 2 and 3 were filed against the
  // wrong school. Prattville goes quiet; Prattville Christian collects games
  // it never played.
  const roster = [
    "Prattville",
    "Prattville Christian",
    "Hoover",
    "Tuscaloosa County",
    "Trinity",
    "Pike Liberal Arts",
    ...Array.from({ length: 14 }, (_, i) => `Other${i + 1}`),
  ];
  const others: Game[] = [];
  for (const w of [1, 2, 3]) {
    for (let i = 0; i < 14; i += 2) {
      others.push(g(`Other${i + 1}`, `Other${i + 2}`, w));
    }
  }
  const games: Game[] = [
    ...others,
    g("Prattville", "Other1", 1),
    g("Prattville Christian", "Other2", 1),
    // Weeks 2 and 3 as the bad match stored them.
    g("Prattville Christian", "Tuscaloosa County", 2),
    g("Trinity", "Prattville Christian", 2),
    g("Hoover", "Prattville Christian", 3),
    g("Prattville Christian", "Pike Liberal Arts", 3),
  ];

  const r = findCoverage(games, roster);
  const hit = r.suspect.find((s) => s.team === "Prattville");
  check("Prattville is flagged", !!hit, r.suspect.map((s) => s.team).join());
  check(
    "for weeks 2 and 3",
    hit?.missing.join() === "2,3",
    hit?.missing.join(),
  );
  check("with its one real game counted", hit?.played === 1, `${hit?.played}`);
  check(
    "and Prattville Christian, which has too many, is not",
    !r.suspect.some((s) => s.team === "Prattville Christian") &&
      !r.byes.some((s) => s.team === "Prattville Christian"),
  );
}

console.log("\n8. A school with nothing at all is separated out");
{
  const { roster, games } = field(20, [1, 2, 3]);
  const r = findCoverage(games, [...roster, "Never Imported"]);
  check("reported as absent", r.absent.join() === "Never Imported", r.absent.join());
  check(
    "rather than as a school missing three weeks",
    !r.suspect.some((s) => s.team === "Never Imported"),
  );
}

console.log(
  failures === 0
    ? "\nThe missing-week scan behaves.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
