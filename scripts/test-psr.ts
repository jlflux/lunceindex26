/**
 * The PSR board: Georgia's Post Season Ranking formula, run on our field.
 *
 * Every expected figure below is written out as arithmetic rather than taken
 * from the implementation, so a change to the formula fails here instead of
 * agreeing with itself.
 *
 * Usage: npm run test:psr
 */
import { PSR_WEIGHTS, WIN_VALUE, computePsr, type PsrTeam } from "../src/lib/psr";
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

const team = (name: string, region = 1, cls: Classification = "6A"): PsrTeam => ({
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

const row = (rows: ReturnType<typeof computePsr>, name: string) =>
  rows.find((r) => r.name === name)!;

/* ------------------------------------------------------------------ 1 */
console.log("\n1. The formula, worked by hand");
{
  // A beats B at home and beats a school outside the association.
  // B beats C at home. C has played once and lost.
  const teams = [team("A"), team("B"), team("C", 2)];
  const games = [
    game("A", 21, "B", 7),
    game("A", 35, "Out Of State U", 0),
    game("B", 14, "C", 10),
  ];
  const rows = computePsr(teams, games);
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
    near(A.psr, 0.35 * 0.95 + 0.35 * 0.5 + 0.3 * 0.475));
  check("which for A is 0.6500", near(A.psr, 0.65));
  check("for B, 0.49125", near(B.psr, 0.49125));
  check("for C, 0.3175", near(C.psr, 0.3175));

  // The one figure that proves the discount is applied: a full-value win
  // would put A at 0.6675.
  check("a 1.0 non-member win would have read 0.6675, and does not",
    !near(A.psr, 0.35 * 1.0 + 0.35 * 0.5 + 0.3 * 0.475));

  check("the weights are the published ones",
    PSR_WEIGHTS.wp === 0.35 && PSR_WEIGHTS.owp === 0.35 && PSR_WEIGHTS.oowp === 0.3);
  check("and sum to one",
    near(PSR_WEIGHTS.wp + PSR_WEIGHTS.owp + PSR_WEIGHTS.oowp, 1));

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
  const rows = computePsr(teams, [
    game("A", 20, "D", 0),
    game("D", 0, "B", 20),
    game("C", 20, "D", 0, { neutral_site: true }),
  ]);
  const A = row(rows, "A"), B = row(rows, "B"), C = row(rows, "C");
  check("home, away and neutral wins are worth the same today",
    near(A.weighted_wins, 1) && near(B.weighted_wins, 1) && near(C.weighted_wins, 1));
  check("and the table says so rather than the code assuming it",
    WIN_VALUE.home === 1 && WIN_VALUE.away === 1 && WIN_VALUE.neutral === 1);
  check("the non-member discount is the only one", WIN_VALUE.nonMember === 0.9);
}

/* ------------------------------------------------------------------ 3 */
console.log("\n3. Results the association rules differently from the field");
{
  const teams = [team("A"), team("B")];
  const played = computePsr(teams, [game("A", 48, "B", 7)]);
  check("on the field, A is 1-0", row(played, "A").wins === 1);

  const vacated = computePsr(teams, [game("A", 48, "B", 7, { forfeit_by: "t1" })]);
  check("a vacated win is a loss here", row(vacated, "A").wins === 0);
  check("and the win goes to the other side", row(vacated, "B").wins === 1);
  check("the scoreline does not come into it",
    near(row(vacated, "B").win_pct, 1));

  // A forfeit with no game ever played still counts as a contest.
  const noShow = computePsr(teams, [game("A", null, "B", null, { forfeit_by: "t1" })]);
  check("a no-show is a contest for both", row(noShow, "A").games === 1 && row(noShow, "B").games === 1);
  check("and a win for the side that turned up", row(noShow, "B").wins === 1);
}

/* ------------------------------------------------------------------ 4 */
console.log("\n4. Games that have not happened");
{
  const teams = [team("A"), team("B")];
  const rows = computePsr(teams, [game("A", null, "B", null)]);
  check("a fixture counts nothing", row(rows, "A").games === 0);
  check("and leaves PSR at zero rather than undefined",
    near(row(rows, "A").psr, 0));
}

/* ------------------------------------------------------------------ 5 */
console.log("\n5. A tie");
{
  const teams = [team("A"), team("B")];
  const rows = computePsr(teams, [game("A", 14, "B", 14)]);
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
  const rows = computePsr(teams, [
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
  const again = computePsr([...teams].reverse(), [
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
  const rows = computePsr([team("Alone"), team("A"), team("B")], [game("A", 7, "B", 0)]);
  const x = row(rows, "Alone");
  check("has no record, no strength terms and no PSR",
    x.games === 0 && near(x.opp_win_pct, 0) && near(x.opp_opp_win_pct, 0) && near(x.psr, 0));
  check("and sits below teams that have played", x.rank === 3);
}

console.log(
  failures === 0
    ? "\nPSR adds up.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
