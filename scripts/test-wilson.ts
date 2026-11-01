/**
 * The Wilson rating.
 *
 * The arithmetic is checked against David Wilson's own published ratings by
 * `npm run validate:wilson`, which needs a checkout of his code and so cannot
 * run here. What is checked here is everything that check cannot see: that
 * the properties the method claims for itself actually hold, and that our
 * additions to it — who is rated, where zero sits — behave.
 *
 * Usage: npm run test:wilson
 */
import { CENTER, rankWilson, type WilsonTeam } from "../src/lib/wilson";
import type { Classification, Game } from "../src/lib/types";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const team = (name: string, region = 1, cls: Classification = "6A"): WilsonTeam => ({
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  classification: cls,
  region,
});

let id = 1;
const game = (
  t1: string, s1: number | null, t2: string, s2: number | null,
  extra: Partial<Game> = {},
): Game => ({
  id: id++, t1, s1, t2, s2, week: 1, type: "regular", round: null, date: null,
  status: s1 === null ? "scheduled" : "final", neutral_site: false,
  forfeit_by: null, ...extra,
});

const rate = (names: string[], games: Game[]) =>
  rankWilson(names.map((n) => team(n)), games);
const of = (rows: ReturnType<typeof rate>, name: string) =>
  rows.find((r) => r.name === name)!;

/* ------------------------------------------------------------------ 1 */
console.log("\n1. One game");
{
  const rows = rate(["A", "B"], [game("A", 21, "B", 7)]);
  // A's rating is B's plus a win; B's is A's minus one. The pair can sit
  // anywhere, so the average is put at 500 — which leaves them ±50.
  check("the winner is 550", of(rows, "A").rating === 550);
  check("the loser is 450", of(rows, "B").rating === 450);
  check("a win is a hundred points",
    of(rows, "A").rating - of(rows, "B").rating === 100);
  check("and the pair averages 500",
    (of(rows, "A").rating + of(rows, "B").rating) / 2 === CENTER);
}

/* ------------------------------------------------------------------ 2 */
console.log("\n2. What the method refuses to look at");
{
  const close = rate(["A", "B"], [game("A", 1, "B", 0)]);
  const rout = rate(["A", "B"], [game("A", 70, "B", 0)]);
  check("seventy points beats one point by exactly as much",
    close[0].rating === rout[0].rating && close[1].rating === rout[1].rating);

  const home = rate(["A", "B"], [game("A", 21, "B", 7)]);
  const away = rate(["A", "B"], [game("B", 7, "A", 21)]);
  check("and where it was played does not come into it",
    of(home, "A").rating === of(away, "A").rating);

  const neutral = rate(["A", "B"], [game("A", 21, "B", 7, { neutral_site: true })]);
  check("nor whether the field was anybody's", of(neutral, "A").rating === 550);
}

/* ------------------------------------------------------------------ 3 */
console.log("\n3. A tie");
{
  const rows = rate(["A", "B"], [game("A", 14, "B", 14)]);
  check("leaves two teams level", of(rows, "A").rating === of(rows, "B").rating);
  check("at the middle", of(rows, "A").rating === CENTER);
  check("and is recorded as a tie",
    of(rows, "A").ties === 1 && of(rows, "A").wins === 0 && of(rows, "A").losses === 0);
}

/* ------------------------------------------------------------------ 4 */
console.log("\n4. Who you beat");
{
  // Two unbeaten teams. One played the team that beat everybody else; the
  // other played the team that lost to everybody else.
  const names = ["Good", "Weak", "Strong", "Poor", "F1", "F2", "F3", "F4"];
  const games = [
    game("Good", 20, "Strong", 7),
    game("Weak", 20, "Poor", 7),
    game("Strong", 30, "F1", 0),
    game("Strong", 30, "F2", 0),
    game("F3", 30, "Poor", 0),
    game("F4", 30, "Poor", 0),
    game("F1", 10, "F3", 7),
    game("F2", 10, "F4", 7),
  ];
  const rows = rate(names, games);
  const good = of(rows, "Good"), weak = of(rows, "Weak");
  check("both are unbeaten", good.wins === 1 && weak.wins === 1);
  check("the one who beat somebody rates higher", good.rating > weak.rating,
    `${good.rating} vs ${weak.rating}`);
  check("and the opponent column says why",
    good.opp_rating > weak.opp_rating);
}

/* ------------------------------------------------------------------ 5 */
console.log("\n5. The result that argues against you");
{
  // A good team adds a win over a team that has lost everything. Under a
  // plain average of game ratings that win would drag it down hard; his
  // twentieth-weight is what stops it.
  const names = ["A", "B", "C", "Hopeless", "X", "Y"];
  const base = [
    game("A", 20, "B", 7),
    game("A", 20, "C", 7),
    game("B", 20, "X", 7),
    game("C", 20, "Y", 7),
    game("X", 20, "Hopeless", 0),
    game("Y", 20, "Hopeless", 0),
  ];
  const before = of(rate(names, base), "A");
  const after = of(rate(names, [...base, game("A", 50, "Hopeless", 0)]), "A");
  const hopeless = of(rate(names, [...base, game("A", 50, "Hopeless", 0)]), "Hopeless");

  check("the extra win is counted as a game", after.games === before.games + 1);
  check("the team beaten is far below", hopeless.rating < after.rating - 100);
  // The plain average would land near the midpoint of the old rating and the
  // weak opponent's game rating — a drop of a hundred points or more.
  check("but it barely moves the rating",
    Math.abs(after.rating - before.rating) < 25,
    `${before.rating} → ${after.rating}`);

  // And the mirror: losing to the best team around is nearly free.
  const top = of(rate(names, base), "A");
  const withLoss = rate(names, [...base, game("A", 0, "B", 1)]);
  check("a loss, by contrast, is felt", of(withLoss, "A").rating < top.rating);
}

/* ------------------------------------------------------------------ 6 */
console.log("\n6. Results the association rules differently from the field");
{
  const played = rate(["A", "B"], [game("A", 48, "B", 7)]);
  check("on the field A wins", of(played, "A").rating === 550);
  const vacated = rate(["A", "B"], [game("A", 48, "B", 7, { forfeit_by: "t1" })]);
  check("a vacated win hands the rating to the other side",
    of(vacated, "B").rating === 550 && of(vacated, "A").rating === 450);
  const noShow = rate(["A", "B"], [game("A", null, "B", null, { forfeit_by: "t1" })]);
  check("and a no-show is a result", of(noShow, "B").rating === 550);
}

/* ------------------------------------------------------------------ 7 */
console.log("\n7. Schools from outside the association");
{
  const rows = rate(["A", "B"], [
    game("A", 21, "B", 7),
    game("A", 35, "Out Of State U", 0),
  ]);
  check("are not on the board", rows.length === 2);
  check("but the game against them is a game", of(rows, "A").games === 2);
  check("and counts as a win", of(rows, "A").wins === 2);
  check("the zero point is still the member average",
    (of(rows, "A").rating + of(rows, "B").rating) / 2 === CENTER);
}

/* ------------------------------------------------------------------ 8 */
console.log("\n8. Teams with nothing to go on");
{
  const rows = rate(["A", "B", "Idle"], [game("A", 21, "B", 7)]);
  const idle = of(rows, "Idle");
  check("a team that has not played has no games", idle.games === 0);
  check("and sits between the two that have",
    idle.rating < of(rows, "A").rating && idle.rating > of(rows, "B").rating);

  const empty = rate(["A", "B"], [game("A", null, "B", null)]);
  check("a fixture rates nobody",
    empty.every((r) => r.games === 0 && r.rating === CENTER));
}

/* ------------------------------------------------------------------ 9 */
console.log("\n9. Reading the board");
{
  const names = ["Big", "Mid", "Small", "Tiny"];
  const rows = rankWilson(
    [team("Big", 1, "6A"), team("Mid", 1, "6A"), team("Small", 1, "2A"), team("Tiny", 1, "2A")],
    [game("Big", 30, "Mid", 0), game("Small", 30, "Tiny", 0), game("Big", 20, "Small", 14)],
  );
  check("the whole field is ranked", rows.map((r) => r.rank).join() === "1,2,3,4");
  const inClass = (c: string) => rows.filter((r) => r.classification === c).map((r) => r.class_rank);
  check("and each class from one",
    inClass("6A").join() === "1,2" && inClass("2A").join() === "1,2");
  check("the order follows the rating",
    rows.every((r, i) => i === 0 || rows[i - 1].rating >= r.rating));
  void names;

  // Same field, teams and games handed over in a different order.
  const again = rankWilson(
    [team("Tiny", 1, "2A"), team("Small", 1, "2A"), team("Mid", 1, "6A"), team("Big", 1, "6A")],
    [game("Big", 20, "Small", 14), game("Small", 30, "Tiny", 0), game("Big", 30, "Mid", 0)],
  );
  check("and nothing depends on the order it all arrived in",
    rows.map((r) => `${r.name}:${r.rating}`).join() ===
      again.map((r) => `${r.name}:${r.rating}`).join(),
    again.map((r) => `${r.name}:${r.rating}`).join());
}

console.log(
  failures === 0 ? "\nThe Wilson board holds.\n" : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
