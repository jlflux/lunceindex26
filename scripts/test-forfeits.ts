/**
 * Checks what a forfeit does and, more importantly, what it does not do.
 *
 * The whole feature is one distinction: a forfeit is a ruling about the record
 * and not a claim about the football. Maplesville beat Isabella 48-7 and then
 * gave the game up over an eligibility violation. Their record is 2-2 and they
 * are still one of the best teams in 1A, and both of those have to survive.
 *
 * So the cases below are mostly about which consumer reads which answer, and
 * section 4 is the one that matters: the rating must not move.
 *
 * Usage: npx tsx scripts/test-forfeits.ts
 */
import { computeRatings } from "../src/lib/engine";
import { computeTwoWay } from "../src/lib/engine-twoway";
import {
  fieldWinner,
  forfeitFor,
  isForfeit,
  officialWinner,
} from "../src/lib/result";
import { regionRecords } from "../src/lib/season";
import {
  DEFAULT_CONFIG,
  TWOWAY_DEFAULTS,
  type Classification,
  type Game,
  type Team,
} from "../src/lib/types";

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
  s1: number | null,
  s2: number | null,
  week: number,
  forfeit_by: "t1" | "t2" | null = null,
): Game => ({
  id: nextId++,
  t1,
  s1,
  t2,
  s2,
  week,
  type: "regular",
  round: null,
  date: null,
  status: s1 === null ? "scheduled" : "final",
  neutral_site: false,
  forfeit_by,
});

const team = (
  name: string,
  classification: Classification = "1A",
  region = 4,
  prior: number | null = 5,
): Team => ({
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  classification,
  region,
  preseason_prior: prior,
  prior_source: null,
});

console.log("\n1. The two questions a game can answer");
{
  const played = g("Maplesville", "Isabella", 48, 7, 1);
  check("no forfeit: the field decides", fieldWinner(played) === "t1");
  check("and the record agrees", officialWinner(played) === "t1");
  check("nothing to report", !isForfeit(played));

  const vacated = g("Maplesville", "Isabella", 48, 7, 1, "t1");
  check("forfeited: the field is unchanged", fieldWinner(vacated) === "t1");
  check("the record is not", officialWinner(vacated) === "t2");
  check("and it is flagged", isForfeit(vacated));
  check(
    "seen from each side",
    forfeitFor(vacated, "t1") === "gave" &&
      forfeitFor(vacated, "t2") === "received",
  );

  // A no-show is a forfeit with no football behind it at all.
  const noShow = g("A", "B", null, null, 2, "t1");
  check("a no-show has no field result", fieldWinner(noShow) === null);
  check("but still has an official one", officialWinner(noShow) === "t2");

  const tie = g("A", "B", 14, 14, 3);
  check("a tie has no winner either way", officialWinner(tie) === null);
}

console.log("\n2. The published record follows the ruling");
{
  const teams = [team("Maplesville"), team("Isabella"), team("McKenzie")];
  const games = [
    g("Maplesville", "Isabella", 48, 7, 1, "t1"),
    g("Maplesville", "McKenzie", 35, 14, 2, "t1"),
    g("Maplesville", "Isabella", 21, 20, 3),
    g("Maplesville", "McKenzie", 28, 0, 4),
  ];
  const { ratings } = computeRatings(teams, games, DEFAULT_CONFIG);
  const m = ratings.find((r) => r.name === "Maplesville")!;
  check("Maplesville is 2-2, not 4-0", m.wins === 2 && m.losses === 2, `${m.wins}-${m.losses}`);
  check("with both forfeits counted", m.forfeits === 2, `${m.forfeits}`);

  const iso = ratings.find((r) => r.name === "Isabella")!;
  check(
    "Isabella is credited with the win it was given",
    iso.wins === 1 && iso.losses === 1,
    `${iso.wins}-${iso.losses}`,
  );
  check("and carries the footnote too", iso.forfeits === 1);
}

console.log("\n3. Scoring averages are the ones played");
{
  const teams = [team("Maplesville"), team("Isabella")];
  const games = [g("Maplesville", "Isabella", 48, 7, 1, "t1")];
  const { ratings } = computeRatings(teams, games, DEFAULT_CONFIG);
  const m = ratings.find((r) => r.name === "Maplesville")!;
  check("points for is 48, not 0", m.ppg === 48, `${m.ppg}`);
  check("points against is 7", m.papg === 7, `${m.papg}`);
}

console.log("\n4. The rating does not move");
{
  // The point of the whole feature. Same games twice, forfeits on one copy.
  const teams = [
    team("Maplesville"),
    team("Isabella"),
    team("McKenzie"),
    team("Verbena"),
    team("Billingsley"),
  ];
  const base: [string, string, number, number, number][] = [
    ["Maplesville", "Isabella", 48, 7, 1],
    ["Maplesville", "McKenzie", 35, 14, 2],
    ["Verbena", "Billingsley", 21, 20, 1],
    ["Isabella", "Billingsley", 14, 28, 2],
    ["McKenzie", "Verbena", 7, 35, 3],
  ];
  const clean = base.map(([a, b, x, y, w]) => g(a, b, x, y, w));
  nextId = 1;
  const vacated = base.map(([a, b, x, y, w]) =>
    g(a, b, x, y, w, a === "Maplesville" ? "t1" : null),
  );

  for (const [label, cfg] of [
    ["classic", DEFAULT_CONFIG],
    ["two-way", { ...DEFAULT_CONFIG, model: "twoway" as const }],
  ] as const) {
    const before =
      label === "classic"
        ? computeRatings(teams, clean, cfg).ratings
        : computeTwoWay(teams, clean, TWOWAY_DEFAULTS).ratings;
    const after =
      label === "classic"
        ? computeRatings(teams, vacated, cfg).ratings
        : computeTwoWay(teams, vacated, TWOWAY_DEFAULTS).ratings;

    const worst = Math.max(
      ...before.map((r) => {
        const b = after.find((x) => x.name === r.name)!;
        return Math.abs(b.rating - r.rating);
      }),
    );
    check(
      `${label}: every rating is identical`,
      worst < 1e-9,
      `largest change ${worst}`,
    );
    const rankBefore = before.map((r) => r.name).join(",");
    const rankAfter = after.map((r) => r.name).join(",");
    check(`${label}: the order is identical`, rankBefore === rankAfter, rankAfter);
  }
}

console.log("\n5. …but Strength of Record does move");
{
  // SOR asks what a team's results have earned. A vacated win is not earned,
  // so this is the one number on the board that a forfeit is supposed to cost.
  const teams = [team("Maplesville"), team("Isabella"), team("McKenzie")];
  const clean = [
    g("Maplesville", "Isabella", 48, 7, 1),
    g("Maplesville", "McKenzie", 35, 14, 2),
  ];
  nextId = 1;
  const vacated = [
    g("Maplesville", "Isabella", 48, 7, 1, "t1"),
    g("Maplesville", "McKenzie", 35, 14, 2, "t1"),
  ];
  const sorOf = (games: Game[]) =>
    computeTwoWay(teams, games, TWOWAY_DEFAULTS).ratings.find(
      (r) => r.name === "Maplesville",
    )!.sor as number;
  check(
    "two vacated wins cost two wins of résumé",
    Math.abs(sorOf(clean) - sorOf(vacated) - 2) < 1e-9,
    `${sorOf(clean)} → ${sorOf(vacated)}`,
  );
}

console.log("\n6. RPI counts the record, so it counts the forfeit");
{
  const teams = [team("Maplesville"), team("Isabella"), team("McKenzie")];
  const games = [
    g("Maplesville", "Isabella", 48, 7, 1, "t1"),
    g("Maplesville", "McKenzie", 35, 14, 2),
  ];
  const { rpi } = computeRatings(teams, games, DEFAULT_CONFIG);
  const m = rpi.find((r) => r.name === "Maplesville")!;
  check("1-1 rather than 2-0", m.wins === 1 && m.losses === 1, `${m.wins}-${m.losses}`);
  check("win percentage follows", Math.abs(m.win_pct - 0.5) < 1e-9, `${m.win_pct}`);
  const iso = rpi.find((r) => r.name === "Isabella")!;
  check("and the opponent's improves", iso.wins === 1, `${iso.wins}`);
  check("the footnote reaches RPI too", m.forfeits === 1);
}

console.log("\n7. Region standings, which decide the playoffs");
{
  const teams = [
    team("Maplesville", "1A", 4),
    team("Isabella", "1A", 4),
    team("Verbena", "1A", 4),
    // Same class, different region: not a region game.
    team("Meek", "1A", 7),
  ];
  const rows = teams.map((t) => ({
    name: t.name,
    classification: t.classification,
    region: t.region,
  }));

  const rec = regionRecords(rows, [
    g("Maplesville", "Isabella", 48, 7, 1, "t1"),
    g("Maplesville", "Verbena", 28, 0, 2),
    g("Maplesville", "Meek", 40, 0, 3),
  ]);
  check(
    "the forfeited region game is a region loss",
    rec.get("Maplesville")!.wins === 1 && rec.get("Maplesville")!.losses === 1,
    JSON.stringify(rec.get("Maplesville")),
  );
  check("and a region win for the opponent", rec.get("Isabella")!.wins === 1);
  check("the out-of-region game still does not count", rec.get("Meek")!.losses === 0);

  // A team that never fielded a side forfeits with no score to read.
  const noShow = regionRecords(rows, [g("Maplesville", "Isabella", null, null, 1, "t1")]);
  check(
    "a forfeit with no score still counts in the region table",
    noShow.get("Isabella")!.wins === 1 && noShow.get("Maplesville")!.losses === 1,
    JSON.stringify(noShow.get("Isabella")),
  );
}

console.log("\n8. Nothing changes for a season without forfeits");
{
  const teams = [team("A"), team("B"), team("C")];
  const games = [
    g("A", "B", 21, 14, 1),
    g("B", "C", 28, 7, 2),
    g("A", "C", 35, 0, 3),
  ];
  const { ratings, rpi } = computeRatings(teams, games, DEFAULT_CONFIG);
  check("no team reports a forfeit", ratings.every((r) => !r.forfeits));
  check("nor on the RPI board", rpi.every((r) => !r.forfeits));
  const a = ratings.find((r) => r.name === "A")!;
  check("records are the plain ones", a.wins === 2 && a.losses === 0);
}

console.log(
  failures === 0
    ? "\nForfeits behave.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
