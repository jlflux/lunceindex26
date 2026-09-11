/**
 * Checks the season helpers: region records, and which week is "current".
 *
 * Both decide what a reader sees first, and both are the kind of thing that
 * goes wrong quietly — a week boundary an hour off, or a non-region game
 * counted toward a playoff race.
 */
import {
  currentWeekKey,
  parseGameDate,
  regionRecords,
  standingsCompare,
  weekKey,
  weekOrder,
} from "../src/lib/season";
import type { Classification, Game, RatingRow } from "../src/lib/types";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const g = (
  t1: string,
  s1: number | null,
  t2: string,
  s2: number | null,
  week: number,
  date: string | null = null,
  type: "regular" | "playoff" = "regular",
): Game => ({
  t1, s1, t2, s2, week, type, round: null, date, status: "final",
});

const row = (
  name: string,
  classification: Classification,
  region: number,
  rating = 0,
  wins = 0,
  losses = 0,
): RatingRow => ({
  name, slug: name.toLowerCase(), classification, region, wins, losses,
  rating, massey: rating, sos: 0, o_eff: 0, d_eff: 0, ppg: 0, papg: 0,
  prior_blend: 0, rank: 0, class_rank: 0,
});

console.log("\n1. Both date shapes in the AHSAA sheets parse");
{
  check("ISO", parseGameDate("2026-09-11")?.toISOString().slice(0, 10) === "2026-09-11");
  check("long form", parseGameDate("Sep. 4, 2026")?.toISOString().slice(0, 10) === "2026-09-04");
  check("long form without the stop", parseGameDate("Sep 4, 2026")?.toISOString().slice(0, 10) === "2026-09-04");
  check("nonsense is rejected rather than guessed", parseGameDate("next friday") === null);
  check("an empty date is null", parseGameDate(null) === null);
}

console.log("\n2. A week runs Monday to Sunday");
{
  // Week 3's games are on Friday 11 September 2026, so its window is the 7th
  // through the 13th.
  const games = [
    g("A", 1, "B", 0, 2, "2026-09-04"),
    g("C", 1, "D", 0, 3, "2026-09-11"),
    g("E", 1, "F", 0, 4, "2026-09-18"),
  ];
  const on = (iso: string) => currentWeekKey(games, new Date(`${iso}T17:00:00Z`));
  check("the Friday of week 3 is week 3", on("2026-09-11") === "r:3", `${on("2026-09-11")}`);
  check("the Monday it starts is week 3", on("2026-09-07") === "r:3", `${on("2026-09-07")}`);
  // The point of Monday-to-Sunday: the weekend belongs to the week just played.
  check("the Sunday after is still week 3", on("2026-09-13") === "r:3", `${on("2026-09-13")}`);
  check("the next Monday turns over to week 4", on("2026-09-14") === "r:4", `${on("2026-09-14")}`);
  check("the Thursday before belongs to week 2", on("2026-09-03") === "r:2", `${on("2026-09-03")}`);
  check("before the season, the first week", on("2026-07-01") === "r:2", `${on("2026-07-01")}`);
  check("after it, the last", on("2026-12-25") === "r:4", `${on("2026-12-25")}`);
}

console.log("\n3. The turnover happens on Alabama's clock, not the server's");
{
  const games = [g("C", 1, "D", 0, 3, "2026-09-11"), g("E", 1, "F", 0, 4, "2026-09-18")];
  // 04:00 UTC on Monday the 14th is still 11pm Sunday in Alabama, so the board
  // must not have turned over yet. A server reading UTC dates would call it
  // Monday and flip a day early.
  check(
    "Sunday 11pm Central is still the old week",
    currentWeekKey(games, new Date("2026-09-14T04:00:00Z")) === "r:3",
    `${currentWeekKey(games, new Date("2026-09-14T04:00:00Z"))}`,
  );
  check(
    "Monday 8am Central has turned over",
    currentWeekKey(games, new Date("2026-09-14T13:00:00Z")) === "r:4",
  );
}

console.log("\n4. A few stray midweek games do not move the window");
{
  // Most of week 3 is on the Friday; a couple of Thursday games must not drag
  // the week's window back a day and turn Thursday into the new week.
  const games = [
    ...Array.from({ length: 20 }, (_, i) => g(`H${i}`, 1, `A${i}`, 0, 3, "2026-09-11")),
    g("X", 1, "Y", 0, 3, "2026-09-10"),
    ...Array.from({ length: 20 }, (_, i) => g(`H2${i}`, 1, `A2${i}`, 0, 4, "2026-09-18")),
  ];
  check(
    "the modal date sets the window",
    currentWeekKey(games, new Date("2026-09-11T17:00:00Z")) === "r:3",
  );
}

console.log("\n5. Region record counts region games and nothing else");
{
  const teams = [
    row("Homewood", "5A", 5),
    row("Mountain Brook", "5A", 5),
    row("John Carroll", "4A", 5),
    row("Briarwood", "AA", 2),
  ];
  const games = [
    g("Homewood", 28, "John Carroll", 14, 0), // different class — not region
    g("Briarwood", 21, "Homewood", 14, 1), // different class — not region
    g("Homewood", 35, "Mountain Brook", 7, 2), // same class and region
  ];
  const reg = regionRecords(teams, games);
  const h = reg.get("Homewood")!;
  check("Homewood is 1-0 in region", h.wins === 1 && h.losses === 0, `${h.wins}-${h.losses}`);
  check(
    "Mountain Brook takes the region loss",
    reg.get("Mountain Brook")!.losses === 1,
  );
  check(
    "the non-region loss to Briarwood is not counted",
    reg.get("Homewood")!.losses === 0,
  );

  // Same class, different region is still not a region game.
  const other = regionRecords(
    [row("A", "5A", 1), row("B", "5A", 2)],
    [g("A", 21, "B", 0, 1)],
  );
  check("same class, different region does not count", other.get("A")!.wins === 0);

  // Playoffs are not region games either.
  const po = regionRecords(
    [row("A", "5A", 1), row("B", "5A", 1)],
    [g("A", 21, "B", 0, 11, null, "playoff")],
  );
  check("a playoff game does not count", po.get("A")!.wins === 0);

  // An unplayed fixture must not be scored.
  const pending = regionRecords(
    [row("A", "5A", 1), row("B", "5A", 1)],
    [g("A", null, "B", null, 1)],
  );
  check("an unplayed region game counts for nobody", pending.get("A")!.wins === 0);
}

console.log("\n6. Standings order puts region record ahead of rating");
{
  const reg = new Map([
    ["Good rating", { wins: 0, losses: 1 }],
    ["Good region", { wins: 1, losses: 0 }],
  ]);
  const a = row("Good rating", "5A", 1, 90);
  const b = row("Good region", "5A", 1, 10);
  check(
    "a 1-0 region team outranks a far better rating at 0-1",
    standingsCompare(a, b, reg) > 0,
  );

  // Percentage before count, the way a standings table reads.
  const r2 = new Map([
    ["One and none", { wins: 1, losses: 0 }],
    ["Three and one", { wins: 3, losses: 1 }],
  ]);
  check(
    "1-0 leads 3-1",
    standingsCompare(row("One and none", "5A", 1, 0), row("Three and one", "5A", 1, 0), r2) < 0,
  );

  // ...with the count breaking a tie on percentage.
  const r3 = new Map([
    ["Two and none", { wins: 2, losses: 0 }],
    ["One and none", { wins: 1, losses: 0 }],
  ]);
  check(
    "2-0 leads 1-0",
    standingsCompare(row("Two and none", "5A", 1, 0), row("One and none", "5A", 1, 0), r3) < 0,
  );

  // A team yet to start region play is neutral, not last.
  const r4 = new Map([
    ["Not started", { wins: 0, losses: 0 }],
    ["Lost one", { wins: 0, losses: 1 }],
  ]);
  check(
    "0-0 in region sits above 0-1",
    standingsCompare(row("Not started", "5A", 1, 0), row("Lost one", "5A", 1, 50), r4) < 0,
  );

  // Rating only speaks once the region records match.
  const r5 = new Map([
    ["Higher", { wins: 1, losses: 0 }],
    ["Lower", { wins: 1, losses: 0 }],
  ]);
  check(
    "equal region records fall through to rating",
    standingsCompare(row("Higher", "5A", 1, 40), row("Lower", "5A", 1, 20), r5) < 0,
  );
}

console.log("\n7. Week keys sort chronologically, playoffs last");
{
  const keys = ["p:r2", "r:10", "r:0", "p:r1", "r:3"];
  const sorted = [...keys].sort((a, b) => weekOrder(a) - weekOrder(b));
  check(
    "regular season in order, then the rounds",
    sorted.join(",") === "r:0,r:3,r:10,p:r1,p:r2",
    sorted.join(","),
  );
  check(
    "a playoff game keys by round, not week",
    weekKey({ type: "playoff", round: "r3", week: 13 }) === "p:r3",
  );
}

console.log(
  failures === 0
    ? "\nSeason helpers behave.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
