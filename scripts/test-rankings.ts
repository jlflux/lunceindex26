/**
 * Checks the two hand-maintained boards: the Composite and the ASWA poll.
 *
 * The Composite arithmetic is checked against real rows from the spreadsheet
 * this replaces, so a rule change that quietly alters the averages shows up
 * as a failing number rather than a board that looks plausible.
 */
import {
  ASWA_TOP,
  buildAswa,
  buildComposite,
  COMPOSITE_SOURCES,
  othersLine,
  type AswaEntry,
  type CompositeEntry,
} from "../src/lib/rankings";
import { CLS_FILTER_ORDER, type Classification } from "../src/lib/types";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const entry = (
  team: string,
  maxpreps: number | null,
  massey: number | null,
  hsratings: number | null,
  ahsfhs: number | null,
): CompositeEntry => ({ team, maxpreps, massey, hsratings, ahsfhs });

console.log("\n1. A team needs all five polls to be ranked");
{
  const ours = new Map([["Full", 5], ["Partial", 1], ["NoIndex", 3]]);
  const rows = buildComposite(
    [
      entry("Full", 5, 5, 5, 5),
      entry("Partial", 1, null, 1, 1), // one poll short
      entry("NoIndex", 2, 2, 2, 2),
    ],
    // A team missing from our own board is short a poll too.
    new Map([["Full", 5], ["Partial", 1]]),
  );
  const by = new Map(rows.map((r) => [r.team, r]));
  check("a complete row is ranked", by.get("Full")!.rank === 1);
  check("a row missing one poll gets no average", by.get("Partial")!.average === null);
  check("and no rank", by.get("Partial")!.rank === 0);
  check(
    "a team we do not rate is also incomplete",
    by.get("NoIndex")!.average === null,
  );
  // The whole point of the rule: without it, Partial averages 1.0 and leads.
  check(
    "incomplete rows sort below complete ones",
    rows[0].team === "Full",
    `got ${rows[0].team}`,
  );
  check("the source count is reported", by.get("Partial")!.have === 4);
  void ours;
}

console.log("\n2. Averages match the spreadsheet this replaces");
{
  // Real rows from the week-two sheet. Its own average is over the four
  // outside polls; ours includes the Index as a fifth, so both are checked —
  // the four-poll figure is what proves the numbers were read correctly.
  const cases: [string, number, number, number, number, number][] = [
    // team, maxpreps, massey, hsratings, ahsfhs, sheet's four-poll average
    ["Thompson", 1, 1, 1, 1, 1],
    ["Central-Phenix City", 2, 3, 3, 4, 3],
    ["Clay-Chalkville", 6, 2, 2, 3, 3.25],
    ["Hillcrest-Tuscaloosa", 4, 4, 5, 2, 3.75],
    ["Vestavia Hills", 3, 6, 4, 15, 7],
    ["Williamson", 22, 10, 12, 6, 12.5],
  ];
  for (const [team, mp, ma, hs, ah, sheet] of cases) {
    const four = (mp + ma + hs + ah) / 4;
    check(`${team}: four-poll mean is ${sheet}`, Math.abs(four - sheet) < 1e-9, `${four}`);
  }

  // And the five-poll version this site publishes.
  const ourRank = new Map([["Clay-Chalkville", 7]]);
  const [row] = buildComposite([entry("Clay-Chalkville", 6, 2, 2, 3)], ourRank);
  check(
    "including the Index changes Clay-Chalkville from 3.25 to 4.00",
    row.average === 4,
    `${row.average}`,
  );
}

console.log("\n3. The board is ordered by the average, lowest first");
{
  const ours = new Map([["A", 1], ["B", 2], ["C", 3]]);
  const rows = buildComposite(
    [entry("C", 9, 9, 9, 9), entry("A", 1, 1, 1, 1), entry("B", 5, 5, 5, 5)],
    ours,
  );
  check("A, B, C", rows.map((r) => r.team).join(",") === "A,B,C", rows.map((r) => r.team).join(","));
  check("ranks run 1, 2, 3", rows.map((r) => r.rank).join(",") === "1,2,3");
}

console.log("\n4. A tie on the average goes to the Index");
{
  // Both average 5; ours has X second and Y eighth.
  const ours = new Map([["X", 2], ["Y", 8]]);
  const rows = buildComposite(
    [entry("Y", 4, 4, 4, 5), entry("X", 6, 6, 6, 5)],
    ours,
  );
  check(
    "equal averages break toward the better Index rank",
    rows[0].team === "X",
    `${rows[0].team} (${rows[0].average} vs ${rows[1].average})`,
  );
}

console.log("\n5. Every source key is a real column");
{
  const e = entry("T", 1, 2, 3, 4);
  check(
    "each declared source reads a value off an entry",
    COMPOSITE_SOURCES.every((s) => typeof e[s.key] === "number"),
    COMPOSITE_SOURCES.map((s) => `${s.key}=${e[s.key]}`).join(" "),
  );
  check("there are four outside polls", COMPOSITE_SOURCES.length === 4);
}

// ---------------------------------------------------------------------------

const poll = (
  classification: string,
  rank: number | null,
  team: string,
  points = 0,
  first_votes = 0,
): AswaEntry => ({
  classification, rank, team, wins: 3, losses: 0, first_votes, points,
});

console.log("\n6. The poll groups by class, ten ranked and the rest below");
{
  const entries: AswaEntry[] = [
    ...Array.from({ length: ASWA_TOP }, (_, i) =>
      poll("6A", i + 1, `Six${i + 1}`, 200 - i * 10, i === 0 ? 18 : 0),
    ),
    poll("6A", null, "SixAlso", 12),
    poll("6A", null, "SixAlsoMore", 25),
    poll("5A", 1, "FiveOne", 200, 20),
  ];
  const blocks = buildAswa(entries, CLS_FILTER_ORDER);
  const six = blocks.find((b) => b.classification === "6A")!;
  check("6A has ten ranked", six.top.length === ASWA_TOP);
  check("in rank order", six.top[0].rank === 1 && six.top[9].rank === 10);
  check("two others receiving votes", six.others.length === 2);
  check(
    "others ordered by points, most first",
    six.others[0].team === "SixAlsoMore",
    six.others.map((o) => o.team).join(","),
  );
  check(
    "the others line reads like a poll release",
    othersLine(six.others) === "SixAlsoMore 25, SixAlso 12",
    othersLine(six.others),
  );
  check("classes come back in display order", blocks[0].classification === "6A");
  check("a class with no entries is omitted", !blocks.some((b) => b.classification === "1A"));
}

console.log("\n7. The top ten keeps the published rank, not the points order");
{
  // A release occasionally lists a team above another it trails on points.
  // That is the panel's business; re-sorting it away would hide a typo too.
  const blocks = buildAswa(
    [poll("4A", 1, "First", 100), poll("4A", 2, "Second", 150)],
    CLS_FILTER_ORDER,
  );
  const four = blocks[0];
  check(
    "rank 1 stays first despite fewer points",
    four.top[0].team === "First",
    four.top.map((t) => t.team).join(","),
  );
}

console.log("\n8. A class with only also-rans still renders");
{
  const blocks = buildAswa([poll("A", null, "Someone", 5)], CLS_FILTER_ORDER);
  check("the block exists", blocks.length === 1);
  check("with an empty top ten", blocks[0].top.length === 0);
  check("and one other", blocks[0].others.length === 1);
  check("a team with no points shows bare", othersLine([poll("A", null, "Bare", 0)]) === "Bare");
}

console.log("\n9. Every classification the site filters by is a valid poll class");
{
  const all: Classification[] = CLS_FILTER_ORDER;
  const blocks = buildAswa(
    all.map((c) => poll(c, 1, `${c}-team`, 100)),
    CLS_FILTER_ORDER,
  );
  check(
    `all ${all.length} classes group`,
    blocks.length === all.length,
    `${blocks.length}`,
  );
}

console.log(
  failures === 0
    ? "\nComposite and ASWA behave.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
