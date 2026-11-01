/**
 * The reproduced boards: Georgia's PSR and South Carolina's SCHSL RPI, each
 * run on our field.
 *
 * Every expected figure below is written out as arithmetic rather than taken
 * from the implementation, so a change to a formula fails here instead of
 * agreeing with itself.
 *
 * Usage: npm run test:boards
 */
import {
  PSR,
  SCHSL,
  rankBy,
  type FormulaRow,
  type FormulaTeam,
} from "../src/lib/formula-boards";
import type { Classification, Game } from "../src/lib/types";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

const team = (name: string, region = 1, cls: Classification = "6A"): FormulaTeam => ({
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

const row = (rows: FormulaRow[], name: string) =>
  rows.find((r) => r.name === name)!;

/** The two boards under test, each as a one-argument call. */
const psr = (teams: FormulaTeam[], games: Game[]) => rankBy(PSR, teams, games);
const schsl = (teams: FormulaTeam[], games: Game[]) => rankBy(SCHSL, teams, games);

/* ------------------------------------------------------------------ 1 */
console.log("\n1. PSR, worked by hand");
{
  // A beats B at home and beats a school outside the association.
  // B beats C at home. C has played once and lost.
  const teams = [team("A"), team("B"), team("C", 2)];
  const games = [
    game("A", 21, "B", 7),
    game("A", 35, "Out Of State U", 0),
    game("B", 14, "C", 10),
  ];
  const rows = psr(teams, games);
  const A = row(rows, "A"), B = row(rows, "B"), C = row(rows, "C");

  // WP = weighted wins / contests played.
  check("a non-member win is worth 0.9", near(A.weighted_wins, 1.0 + 0.9));
  check("and WP divides by contests, not by weight", near(A.win_pct, 1.9 / 2));
  check("B's two games, one won", near(B.win_pct, 1.0 / 2));
  check("C has won nothing", near(C.win_pct, 0));

  // OWP: the member opponents only. A played B and a non-member; if the
  // non-member counted, A's OWP would be 0.25 rather than 0.5.
  check("OWP skips the school outside the association", near(A.opp_win_pct, 0.5));
  check("B's two opponents average 0.475",
    near(B.opp_win_pct, (0.95 + 0) / 2));

  // OOWP: the average of each member opponent's OWP.
  check("A's OOWP is B's OWP", near(A.opp_opp_win_pct, 0.475));
  check("B's OOWP averages A's and C's",
    near(B.opp_opp_win_pct, (0.5 + 0.5) / 2));

  check("PSR is 0.35/0.35/0.30 of the three",
    near(A.value, 0.35 * 0.95 + 0.35 * 0.5 + 0.3 * 0.475));
  check("which for A is 0.6500", near(A.value, 0.65));
  check("for B, 0.49125", near(B.value, 0.49125));
  check("for C, 0.3175", near(C.value, 0.3175));

  // The one figure that proves the discount is applied: a full-value win
  // would put A at 0.6675.
  check("a 1.0 non-member win would have read 0.6675, and does not",
    !near(A.value, 0.35 * 1.0 + 0.35 * 0.5 + 0.3 * 0.475));

  check("the weights are the published ones",
    PSR.weights.wp === 0.35 && PSR.weights.owp === 0.35 && PSR.weights.oowp === 0.3);
  check("and sum to one",
    near(PSR.weights.wp + PSR.weights.owp + PSR.weights.oowp, 1));

  check("the board is ordered by PSR", rows.map((r) => r.name).join(",") === "A,B,C");
  check("and ranked from one", A.rank === 1 && B.rank === 2 && C.rank === 3);
  check("A counts one non-member win", A.non_member_wins === 1);
  check("B counts none", B.non_member_wins === 0);
}

/* ------------------------------------------------------------------ 2 */
console.log("\n2. Where a win was won");
{
  const teams = [team("A"), team("B"), team("C"), team("D")];
  // A wins at home, B wins away, C wins on a neutral field. Same opponent
  // strength on each side, so only the venue differs.
  const rows = psr(teams, [
    game("A", 20, "D", 0),
    game("D", 0, "B", 20),
    game("C", 20, "D", 0, { neutral_site: true }),
  ]);
  const A = row(rows, "A"), B = row(rows, "B"), C = row(rows, "C");
  check("home, away and neutral wins are worth the same today",
    near(A.weighted_wins, 1) && near(B.weighted_wins, 1) && near(C.weighted_wins, 1));
  check("and the table says so rather than the code assuming it",
    PSR.winValue.home === 1 && PSR.winValue.away === 1 && PSR.winValue.neutral === 1);
  check("the non-member discount is the only one", PSR.winValue.nonMember === 0.9);
}

/* ------------------------------------------------------------------ 3 */
console.log("\n3. Results the association rules differently from the field");
{
  const teams = [team("A"), team("B")];
  const played = psr(teams, [game("A", 48, "B", 7)]);
  check("on the field, A is 1-0", row(played, "A").wins === 1);

  const vacated = psr(teams, [game("A", 48, "B", 7, { forfeit_by: "t1" })]);
  check("a vacated win is a loss here", row(vacated, "A").wins === 0);
  check("and the win goes to the other side", row(vacated, "B").wins === 1);
  check("the scoreline does not come into it",
    near(row(vacated, "B").win_pct, 1));

  // A forfeit with no game ever played still counts as a contest.
  const noShow = psr(teams, [game("A", null, "B", null, { forfeit_by: "t1" })]);
  check("a no-show is a contest for both", row(noShow, "A").games === 1 && row(noShow, "B").games === 1);
  check("and a win for the side that turned up", row(noShow, "B").wins === 1);
}

/* ------------------------------------------------------------------ 4 */
console.log("\n4. Games that have not happened");
{
  const teams = [team("A"), team("B")];
  const rows = psr(teams, [game("A", null, "B", null)]);
  check("a fixture counts nothing", row(rows, "A").games === 0);
  check("and leaves PSR at zero rather than undefined",
    near(row(rows, "A").value, 0));
}

/* ------------------------------------------------------------------ 5 */
console.log("\n5. A tie");
{
  const teams = [team("A"), team("B")];
  const rows = psr(teams, [game("A", 14, "B", 14)]);
  const A = row(rows, "A");
  check("counts half a win to each", near(A.weighted_wins, 0.5));
  check("and is neither a win nor a loss in the record",
    A.wins === 0 && A.losses === 0 && A.ties === 1);
  check("so WP reads .500", near(A.win_pct, 0.5));
}

/* ------------------------------------------------------------------ 6 */
console.log("\n6. Reading the board");
{
  const teams = [
    team("Big", 1, "6A"), team("Mid", 1, "6A"),
    team("Small", 1, "2A"), team("Tiny", 1, "2A"),
  ];
  const rows = psr(teams, [
    game("Big", 30, "Mid", 0),
    game("Small", 30, "Tiny", 0),
  ]);
  const byClass = (cls: string) =>
    rows.filter((r) => r.classification === cls).map((r) => r.class_rank);
  check("each class is numbered from one",
    byClass("6A").join() === "1,2" && byClass("2A").join() === "1,2");
  check("while the overall rank runs the whole field",
    rows.map((r) => r.rank).join() === "1,2,3,4");

  // Identical records in identical-sized worlds: the order must not depend on
  // the order the teams arrived in.
  const again = psr([...teams].reverse(), [
    game("Small", 30, "Tiny", 0),
    game("Big", 30, "Mid", 0),
  ]);
  check("and a tie in PSR orders the same way twice",
    rows.map((r) => r.name).join() === again.map((r) => r.name).join(),
    `${rows.map((r) => r.name).join()} vs ${again.map((r) => r.name).join()}`);
}

/* ------------------------------------------------------------------ 7 */
console.log("\n7. A team nobody has played");
{
  const rows = psr([team("Alone"), team("A"), team("B")], [game("A", 7, "B", 0)]);
  const x = row(rows, "Alone");
  check("has no record, no strength terms and no PSR",
    x.games === 0 && near(x.opp_win_pct, 0) && near(x.opp_opp_win_pct, 0) && near(x.value, 0));
  check("and sits below teams that have played", x.rank === 3);
}

/* ------------------------------------------------------------------ 8 */
console.log("\n8. SCHSL, worked by hand");
{
  // The same three teams and the same out-of-association opponent as section
  // 1, so the two boards can be read against each other.
  const teams = [team("A"), team("B"), team("C", 2)];
  const games = [
    game("A", 21, "B", 7),
    game("A", 35, "Out Of State U", 0),
    game("B", 14, "C", 10),
  ];
  const rows = schsl(teams, games);
  const A = row(rows, "A"), B = row(rows, "B"), C = row(rows, "C");

  check("the weights are 40/30/30",
    SCHSL.weights.wp === 0.4 && SCHSL.weights.owp === 0.3 && SCHSL.weights.oowp === 0.3);
  check("and sum to one",
    near(SCHSL.weights.wp + SCHSL.weights.owp + SCHSL.weights.oowp, 1));

  check("every win is worth one here",
    SCHSL.winValue.home === 1 && SCHSL.winValue.away === 1 &&
    SCHSL.winValue.neutral === 1 && SCHSL.winValue.nonMember === 1);
  check("so the win outside the association is not discounted",
    near(A.weighted_wins, 2) && near(A.win_pct, 1));
  check("where PSR had it at 1.9", near(row(psr(teams, games), "A").weighted_wins, 1.9));

  // The school outside the association is still no part of the strength
  // terms: A's only member opponent is B.
  check("and is still no part of the strength terms", near(A.opp_win_pct, 0.5));

  check("A reads 0.7000", near(A.value, 0.4 * 1 + 0.3 * 0.5 + 0.3 * 0.5));
  check("B reads 0.5000", near(B.value, 0.5));
  check("C reads 0.3000", near(C.value, 0.3));
  check("the board is ordered by the figure",
    rows.map((r) => r.name).join(",") === "A,B,C");
}

/* ------------------------------------------------------------------ 9 */
console.log("\n9. What separates the two boards");
{
  // No game against a school outside the association, so both boards see the
  // same three figures and only the weights differ. Then, by arithmetic:
  //   SCHSL - PSR = 0.05 x (WP - OWP)
  const teams = [team("A"), team("B"), team("C"), team("D")];
  const games = [
    game("A", 21, "B", 7),
    game("B", 28, "C", 0),
    game("C", 14, "D", 13),
    game("D", 35, "A", 7),
    game("A", 10, "C", 7),
  ];
  const p = psr(teams, games);
  const s = schsl(teams, games);

  let identity = true;
  let moved = false;
  for (const t of ["A", "B", "C", "D"]) {
    const x = row(p, t), y = row(s, t);
    if (!near(y.value - x.value, 0.05 * (x.win_pct - x.opp_win_pct))) identity = false;
    if (!near(x.value, y.value)) moved = true;
    // The three inputs must be identical, or the sentence above is about
    // two different sets of numbers.
    if (!near(x.win_pct, y.win_pct) || !near(x.opp_win_pct, y.opp_win_pct)
      || !near(x.opp_opp_win_pct, y.opp_opp_win_pct)) identity = false;
  }
  check("five points moved from the schedule to the record", identity);
  check("and it moves somebody", moved);
}

/* ----------------------------------------------------------------- 10 */
console.log("\n10. Where the two boards disagree");
{
  // Eight teams, fourteen games. T7 has lost its only game — to the one team
  // that won everything — so its schedule carries it to sixth under PSR. The
  // board that cares more about what you did drops it below T4, which has
  // actually won one.
  const names = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"];
  const teams = names.map((n) => team(n));
  const games = (
    "T1>T2 T3>T1 T1>T5 T6>T1 T3>T2 T2>T5 T2>T6 T8>T2 " +
    "T3>T6 T3>T7 T3>T8 T5>T4 T4>T6 T5>T6"
  )
    .split(" ")
    .map((pair) => {
      const [w, l] = pair.split(">");
      return game(w, 21, l, 7);
    });

  const p = psr(teams, games).map((r) => r.name);
  const s = schsl(teams, games).map((r) => r.name);
  check("PSR has T7 sixth", p.join(" ") === "T3 T8 T1 T2 T5 T7 T4 T6", p.join(" "));
  check("SCHSL has it seventh", s.join(" ") === "T3 T8 T1 T2 T5 T4 T7 T6", s.join(" "));
  check("so the order is not the same board twice", p.join() !== s.join());

  const seventh = row(psr(teams, games), "T7");
  check("because T7 won nothing and played the one team that won everything",
    seventh.wins === 0 && near(seventh.opp_win_pct, 1));
}

console.log(
  failures === 0
    ? "\nThe boards add up.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
