/**
 * Both engines on the same data, side by side.
 *
 * The admin Formula page can switch engines and preview a top 25; this is the
 * same comparison in the terminal, with the reference systems alongside so the
 * question "which one is closer to everyone else" has an answer rather than an
 * impression.
 *
 * Usage: npx tsx scripts/compare-boards.ts [rows]
 */
import { computeBoard } from "../src/lib/board";
import { MIN_GAMES_FOR_SPLIT } from "../src/lib/format";
import { roster, games } from "./tune";

const rows = Number(process.argv[2]) || 20;
const teams = roster();
const G = games();

const classic = computeBoard(teams, G, {});
const twoway = computeBoard(teams, G, { model: "twoway" });

const played = G.filter((g) => g.s1 !== null).length;
console.log(
  `\n${teams.length} teams · ${played} games played · both engines, same data\n`,
);

console.log(
  "     CLASSIC (Massey)                      |  TWO-WAY (adjusted offence & defence)",
);
console.log(
  "  #  Team                    Rating  Rec   |  #  Team                     Net  AdjO  AdjD   SoR",
);
for (let i = 0; i < Math.min(rows, classic.ratings.length); i++) {
  const c = classic.ratings[i];
  const t = twoway.ratings[i];
  // The split is prior-dominated until a team has played a few games; the net
  // rating is not. Show a dash rather than a number the results cannot support.
  const split =
    t.wins + t.losses >= MIN_GAMES_FOR_SPLIT
      ? `${(t.adj_o as number).toFixed(1).padStart(5)} ${(t.adj_d as number).toFixed(1).padStart(5)}`
      : `${"—".padStart(5)} ${"—".padStart(5)}`;
  console.log(
    `${String(i + 1).padStart(3)}  ${c.name.padEnd(22)} ${c.rating.toFixed(1).padStart(6)}  ${c.wins}-${c.losses}  ` +
      `| ${String(i + 1).padStart(2)}  ${t.name.padEnd(22)} ${t.rating.toFixed(1).padStart(5)} ` +
      `${split} ` +
      `${(t.sor as number) >= 0 ? "+" : ""}${(t.sor as number).toFixed(2).padStart(5)}`,
  );
}

// Biggest disagreements between the two engines, which is where to look first.
const twRank = new Map(twoway.ratings.map((r) => [r.name, r.rank]));
const moved = classic.ratings
  .filter((r) => r.wins + r.losses > 0)
  .map((r) => ({
    name: r.name,
    classic: r.rank,
    twoway: twRank.get(r.name) as number,
    delta: (twRank.get(r.name) as number) - r.rank,
  }))
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

console.log("\nBiggest disagreements between the two engines:");
for (const m of moved.slice(0, 12)) {
  console.log(
    `  ${m.name.padEnd(24)} classic #${String(m.classic).padStart(3)} → two-way #${String(m.twoway).padStart(3)}  (${m.delta > 0 ? "+" : ""}${m.delta})`,
  );
}

// And the résumé board, which is a different question from the rating.
const byResume = [...twoway.ratings]
  .filter((r) => r.wins + r.losses > 0)
  .sort((a, b) => (b.sor as number) - (a.sor as number));
console.log("\nTwo-way résumé board — what each team has EARNED, margin ignored:");
for (let i = 0; i < Math.min(12, byResume.length); i++) {
  const r = byResume[i];
  console.log(
    `${String(i + 1).padStart(3)}  ${r.name.padEnd(24)} ${r.wins}-${r.losses}  ` +
      `SoR ${(r.sor as number) >= 0 ? "+" : ""}${(r.sor as number).toFixed(2)}   (rating board #${r.rank})`,
  );
}
console.log();
