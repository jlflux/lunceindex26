import type { Game } from "./types";

export const fmt = (n: number, digits = 2) =>
  Number.isFinite(n) ? n.toFixed(digits) : "—";

/** Signed, for differentials where the direction is the point. */
export const fmtSigned = (n: number, digits = 1) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;

export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export const record = (w: number, l: number) => `${w}-${l}`;

export function weekLabel(g: Pick<Game, "week" | "type" | "round">): string {
  if (g.type === "playoff") {
    const labels: Record<string, string> = {
      r1: "Playoffs R1",
      r2: "Playoffs R2",
      r3: "Quarterfinals",
      r4: "Semifinals",
      r5: "Championship",
    };
    return g.round ? (labels[g.round] ?? "Playoffs") : "Playoffs";
  }
  return g.week === 0 ? "Week 0" : `Week ${g.week}`;
}

/** Ordinal suffix for ranks: 1st, 2nd, 3rd, 11th… */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
