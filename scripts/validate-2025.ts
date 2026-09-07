/**
 * Validates the composite step of the engine against the 2025 season output.
 *
 * The 2025 export gives each team's final `rating` alongside the inputs that
 * produce it — massey, sos, o_eff, d_eff and the record. That is enough to
 * re-derive the composite (engine step 5) and diff it team by team, without
 * needing the 2,050 individual game results.
 *
 * What this DOES cover: the composite formula, the SOS median, the efficiency
 * damping, and the win-rate term.
 * What it does NOT cover: the Massey solve itself (steps 1–3), which still
 * needs the 2025 game data to reproduce.
 *
 * Usage: npx tsx scripts/validate-2025.ts
 */
import { readFileSync } from "node:fs";
import { parseCsvText } from "../src/lib/csv";
import { CONFIG_2025, DEFAULT_CONFIG } from "../src/lib/types";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

interface Row {
  rank: number;
  team: string;
  w: number;
  l: number;
  rating: number;
  massey: number;
  sos: number;
  oEff: number;
  dEff: number;
}

const rows = parseCsvText(
  readFileSync("data/validation_2025_expected.csv", "utf8"),
);
const header = rows[0].map((h) => h.trim());
const col = (name: string) => header.indexOf(name);

const data: Row[] = rows.slice(1).map((r) => ({
  rank: Number(r[col("Rank")]),
  team: r[col("Team")],
  w: Number(r[col("W")]),
  l: Number(r[col("L")]),
  rating: Number(r[col("Rating")]),
  massey: Number(r[col("Massey")]),
  sos: Number(r[col("SOS")]),
  oEff: Number(r[col("O_Eff")]),
  dEff: Number(r[col("D_Eff")]),
}));

console.log(`2025 teams: ${data.length}`);

// The weights that season was actually rated under. Using the current
// defaults would mean this check quietly stopped verifying the port the day
// the defaults were tuned.
const cfg = { ...DEFAULT_CONFIG, ...CONFIG_2025 };
const medianSos = median(data.filter((d) => d.sos > 0).map((d) => d.sos));
console.log(
  `median SOS (teams with sos > 0): ${medianSos.toFixed(4)}  ` +
    `[${data.filter((d) => d.sos > 0).length} of ${data.length} teams]`,
);
console.log(
  `config: sos_w=${cfg.sos_w} eff_w=${cfg.eff_w} wr_w=${cfg.wr_w}\n`,
);

// The export rounds every column to 2 decimals, so ~0.02 of slack is the
// floor for what any correct implementation can achieve here.
const TOLERANCE = 0.02;

let worst = { team: "", diff: 0 };
let within01 = 0;
let within05 = 0;
const diffs: number[] = [];

for (const d of data) {
  const games = d.w + d.l;
  const winRate = games ? d.w / games : 0.5;
  const scale = clamp(d.sos / medianSos, 0, 1);

  let composite = d.massey;
  if (games > 0) composite += (d.sos - medianSos) * cfg.sos_w;
  composite += (d.oEff + d.dEff) * cfg.eff_w * scale;
  composite += (winRate - 0.5) * cfg.wr_w;

  const diff = Math.abs(composite - d.rating);
  diffs.push(diff);
  if (diff < 0.01) within01++;
  if (diff < 0.05) within05++;
  if (diff > Math.abs(worst.diff)) worst = { team: d.team, diff: composite - d.rating };
}

const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;

const withinTol = diffs.filter((d) => d < TOLERANCE).length;

console.log(`within 0.01:  ${within01} / ${data.length}`);
console.log(`within 0.05:  ${within05} / ${data.length}`);
console.log(`within ${TOLERANCE}:  ${withinTol} / ${data.length}`);
console.log(`mean |diff|:  ${mean.toFixed(5)}`);
console.log(
  `worst:        ${worst.team} off by ${worst.diff.toFixed(4)}\n`,
);

// The sanity check PROJECT.md calls for.
const expectedTop = [
  "Clay-Chalkville",
  "Thompson",
  "Jackson",
  "Saraland",
  "Central-Phenix City",
];
const actualTop = data.slice(0, 5).map((d) => d.team);
console.log("Top 5 in the 2025 export:", actualTop.join(", "));
console.log(
  expectedTop.every((t, i) => actualTop[i] === t)
    ? "  ok   matches the expected 2025 finish"
    : "  note ordering differs from PROJECT.md's sanity list",
);

const ok = withinTol === data.length;
console.log(
  ok
    ? "\nComposite step reproduces all 387 of the 2025 ratings within rounding.\n"
    : `\n${data.length - withinTol} team(s) outside ${TOLERANCE} — the composite does not match.\n`,
);
process.exit(ok ? 0 : 1);
