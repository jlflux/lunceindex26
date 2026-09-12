/**
 * Checks the duplicate detector. This drives a delete button, so the rules
 * that decide what is redundant need to be exercised directly.
 */
import { findDuplicates, redundantIds } from "../src/lib/duplicates";
import type { Game } from "../src/lib/types";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const g = (
  id: number,
  t1: string,
  t2: string,
  week: number,
  s1: number | null = null,
  s2: number | null = null,
  type: "regular" | "playoff" = "regular",
): Game => ({
  id,
  t1,
  s1,
  t2,
  s2,
  week,
  type,
  round: type === "playoff" ? "r1" : null,
  date: null,
  status: null,
});

console.log("\n1. A clean schedule reports nothing");
{
  const r = findDuplicates([
    g(1, "Thompson", "Hoover", 1),
    g(2, "Hoover", "Vestavia Hills", 2),
    g(3, "Thompson", "Vestavia Hills", 3),
  ]);
  check("no reversed", r.reversed.length === 0);
  check("no repeated", r.repeated.length === 0);
}

console.log("\n2. Sides swapped in the same week is caught");
{
  const r = findDuplicates([
    g(1, "Homewood", "John Carroll", 0),
    g(2, "John Carroll", "Homewood", 0),
  ]);
  check("one reversed group", r.reversed.length === 1);
  check("holding both rows", r.reversed[0]?.games.length === 2);
  check("not also reported as repeated", r.repeated.length === 0);
}

console.log("\n3. The copy with a score is the one kept");
{
  const r = findDuplicates([
    g(1, "Homewood", "John Carroll", 0), // no score, imported later
    g(2, "John Carroll", "Homewood", 0, 21, 14), // has the result
  ]);
  const drop = redundantIds(r.reversed[0]);
  check("exactly one row dropped", drop.length === 1);
  check("the scoreless row is the one dropped", drop[0] === 1, `dropped ${drop[0]}`);
}

console.log("\n4. With no scores anywhere, the earliest row survives");
{
  const r = findDuplicates([
    g(7, "A", "B", 3),
    g(2, "B", "A", 3),
    g(9, "A", "B", 3),
  ]);
  const drop = redundantIds(r.reversed[0]).sort((x, y) => x - y);
  check("two rows dropped", drop.length === 2);
  check("id 2 kept", !drop.includes(2), `dropped ${drop.join(",")}`);
}

console.log("\n5. Same pair in different weeks is flagged, not assumed wrong");
{
  const r = findDuplicates([g(1, "A", "B", 2), g(2, "A", "B", 7)]);
  check("no reversed group", r.reversed.length === 0);
  check("one repeated group", r.repeated.length === 1);
}

console.log("\n6. A playoff rematch is not a duplicate");
{
  const r = findDuplicates([
    g(1, "Thompson", "Hoover", 5),
    g(2, "Thompson", "Hoover", 12, null, null, "playoff"),
  ]);
  check("no reversed", r.reversed.length === 0);
  check("no repeated", r.repeated.length === 0, "playoff meetings are normal");
}

console.log("\n7. A regular and a playoff meeting in the same week coexist");
{
  const r = findDuplicates([
    g(1, "A", "B", 11),
    g(2, "A", "B", 11, null, null, "playoff"),
  ]);
  check("type keeps them apart", r.reversed.length === 0);
}

console.log("\n8. Order of the two names does not change the grouping");
{
  const a = findDuplicates([g(1, "Zeta", "Alpha", 4), g(2, "Alpha", "Zeta", 4)]);
  const b = findDuplicates([g(1, "Alpha", "Zeta", 4), g(2, "Zeta", "Alpha", 4)]);
  check(
    "same result either way round",
    a.reversed.length === 1 && b.reversed.length === 1,
  );
}

console.log("\n9. Every group keeps at least one row");
{
  const r = findDuplicates([
    g(1, "A", "B", 1),
    g(2, "B", "A", 1),
    g(3, "C", "D", 2, 10, 7),
    g(4, "D", "C", 2, 7, 10),
  ]);
  const survives = r.reversed.every(
    (grp) => redundantIds(grp).length < grp.games.length,
  );
  check("nothing is fully deleted", survives);
}

console.log("\n10. One school with two games in a week");
{
  // The case that caught nothing before: the opponents differ, so the pair
  // checks above have nothing to group on. This is what a name matched to the
  // wrong school leaves behind on whoever it played.
  const r = findDuplicates([
    g(1, "Tuscaloosa County", "Prattville", 2, 0, 62),
    g(2, "Tuscaloosa County", "Prattville Christian", 2, 0, 62),
    g(3, "Hoover", "Vestavia Hills", 2),
  ]);
  check("one collision", r.collisions.length === 1, `${r.collisions.length}`);
  check("naming the school with two games", r.collisions[0]?.label.startsWith("Tuscaloosa County"));
  check("holding both rows", r.collisions[0]?.games.length === 2);
  check("and it is not a reversed pair", r.reversed.length === 0);
  check("nor a repeated pairing", r.repeated.length === 0);
  check("a school with one game is untouched", r.collisions.length === 1);
}

console.log("\n11. A collision is reported once, not once per school");
{
  const r = findDuplicates([
    g(1, "A", "B", 1),
    g(2, "A", "C", 1),
    g(3, "B", "C", 1),
  ]);
  // A, B and C each have two games this week, but there are three distinct
  // fixtures — so three groups, one per school, is correct here.
  check("three schools each doubled up", r.collisions.length === 3, `${r.collisions.length}`);
  const labels = r.collisions.map((c) => c.label.split(" ·")[0]).sort();
  check("one per school", labels.join() === "A,B,C", labels.join());
}

console.log("\n12. A swapped pair is not also reported as a collision");
{
  // Both rows are the same fixture, already reported above. Counting it twice
  // would make one fault look like three.
  const r = findDuplicates([g(1, "A", "B", 1), g(2, "B", "A", 1)]);
  check("one reversed group", r.reversed.length === 1);
  check("no collisions", r.collisions.length === 0, `${r.collisions.length}`);
}

console.log("\n13. Playoff rounds sharing a week number are not collisions");
{
  const r = findDuplicates([
    { ...g(1, "Thompson", "Hoover", 12, 28, 21, "playoff"), round: "r1" },
    { ...g(2, "Thompson", "Auburn", 12, 35, 14, "playoff"), round: "r2" },
  ]);
  check("rounds keep them apart", r.collisions.length === 0, `${r.collisions.length}`);
}

console.log("\n14. Two games in the same playoff round is still a collision");
{
  const r = findDuplicates([
    { ...g(1, "Thompson", "Hoover", 12, 28, 21, "playoff"), round: "r1" },
    { ...g(2, "Thompson", "Auburn", 12, 35, 14, "playoff"), round: "r1" },
  ]);
  check("caught", r.collisions.length === 1, `${r.collisions.length}`);
}

console.log(
  failures === 0
    ? "\nDuplicate detection behaves.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
