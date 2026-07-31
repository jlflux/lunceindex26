/**
 * Bulk weekly score import.
 *
 * Accepts a forgiving CSV: any column order, flexible headers, team names in
 * whatever spelling the source used (they run through the same matcher the
 * PDF import uses). Nothing is written until the admin confirms the preview.
 */
import { buildIndex, matchTeam, type MatcherIndex } from "./names";
import type { Game, Team } from "./types";

export interface ScoreRow {
  homeRaw: string;
  awayRaw: string;
  home: string | null;
  away: string | null;
  homeScore: number | null;
  awayScore: number | null;
  week: number;
  type: "regular" | "playoff";
  round: Game["round"];
  /** Populated when the row cannot be imported as-is. */
  error: string | null;
  /** Populated when the row is importable but worth a second look. */
  warning: string | null;
}

export interface ScoreImportPreview {
  rows: ScoreRow[];
  ok: number;
  errors: number;
  warnings: number;
}

const HEADER_ALIASES: Record<string, string[]> = {
  home: ["home", "home team", "hometeam", "t1", "home_team"],
  away: ["away", "visitor", "away team", "awayteam", "t2", "away_team"],
  homeScore: [
    "home score",
    "homescore",
    "hs",
    "s1",
    "home_score",
    "home pts",
    "home points",
  ],
  awayScore: [
    "away score",
    "awayscore",
    "as",
    "s2",
    "away_score",
    "visitor score",
    "away pts",
    "away points",
  ],
  week: ["week", "wk"],
  type: ["type", "season", "game type"],
  round: ["round", "playoff round"],
};

function columnIndex(header: string[], key: keyof typeof HEADER_ALIASES) {
  const wanted = HEADER_ALIASES[key];
  return header.findIndex((h) => wanted.includes(h.trim().toLowerCase()));
}

const ROUND_ALIASES: Record<string, Game["round"]> = {
  r1: "r1",
  r2: "r2",
  r3: "r3",
  r4: "r4",
  r5: "r5",
  "1": "r1",
  "2": "r2",
  "3": "r3",
  "4": "r4",
  "5": "r5",
  "first round": "r1",
  "second round": "r2",
  quarterfinals: "r3",
  quarters: "r3",
  semifinals: "r4",
  semis: "r4",
  championship: "r5",
  finals: "r5",
  final: "r5",
};

export function previewScoreCsv(
  rows: string[][],
  teams: Team[],
  defaults: { week: number; type: "regular" | "playoff"; round: Game["round"] },
  extraAliases: Record<string, string> = {},
): ScoreImportPreview {
  if (!rows.length) {
    return { rows: [], ok: 0, errors: 0, warnings: 0 };
  }

  const index: MatcherIndex = buildIndex(teams);
  const header = rows[0];

  const iHome = columnIndex(header, "home");
  const iAway = columnIndex(header, "away");
  const iHomeScore = columnIndex(header, "homeScore");
  const iAwayScore = columnIndex(header, "awayScore");
  const iWeek = columnIndex(header, "week");
  const iType = columnIndex(header, "type");
  const iRound = columnIndex(header, "round");

  if (iHome < 0 || iAway < 0 || iHomeScore < 0 || iAwayScore < 0) {
    throw new Error(
      "CSV needs home, away, home score and away score columns. " +
        `Found: ${header.join(", ")}`,
    );
  }

  const out: ScoreRow[] = [];

  for (const r of rows.slice(1)) {
    const homeRaw = (r[iHome] ?? "").trim();
    const awayRaw = (r[iAway] ?? "").trim();
    if (!homeRaw && !awayRaw) continue;

    const parseScore = (v: string | undefined): number | null => {
      const s = (v ?? "").trim();
      if (s === "") return null;
      const n = Number(s);
      return Number.isInteger(n) && n >= 0 && n <= 200 ? n : NaN;
    };

    const homeScore = parseScore(r[iHomeScore]);
    const awayScore = parseScore(r[iAwayScore]);

    const week = iWeek >= 0 && r[iWeek]?.trim() ? Number(r[iWeek]) : defaults.week;

    const typeRaw = (iType >= 0 ? r[iType] : "")?.trim().toLowerCase();
    const type: "regular" | "playoff" =
      typeRaw === "playoff" || typeRaw === "playoffs"
        ? "playoff"
        : typeRaw === "regular"
          ? "regular"
          : defaults.type;

    const roundRaw = (iRound >= 0 ? r[iRound] : "")?.trim().toLowerCase();
    const round: Game["round"] =
      type === "playoff"
        ? (ROUND_ALIASES[roundRaw ?? ""] ?? defaults.round ?? null)
        : null;

    const home = matchTeam({ raw: homeRaw, extraAliases }, index);
    const away = matchTeam({ raw: awayRaw, extraAliases }, index);

    let error: string | null = null;
    let warning: string | null = null;

    if (!homeRaw || !awayRaw) {
      error = "Both team names are required.";
    } else if (!home.name) {
      error = `No roster match for "${homeRaw}".`;
    } else if (!away.name) {
      error = `No roster match for "${awayRaw}".`;
    } else if (home.name === away.name) {
      error = "Home and away are the same team.";
    } else if (home.outOfState && away.outOfState) {
      error = "Neither team is an AHSAA member.";
    } else if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) {
      error = "Scores must be whole numbers between 0 and 200.";
    } else if ((homeScore === null) !== (awayScore === null)) {
      error = "Enter both scores or neither.";
    } else if (!Number.isInteger(week) || week < 0 || week > 20) {
      error = `Invalid week "${week}".`;
    } else if (type === "playoff" && !round) {
      error = "Playoff rows need a round (r1–r5).";
    } else {
      const notes = [home.note, away.note].filter(Boolean);
      if (notes.length) warning = notes.join(" ");
    }

    out.push({
      homeRaw,
      awayRaw,
      home: home.name,
      away: away.name,
      homeScore: Number.isNaN(homeScore) ? null : homeScore,
      awayScore: Number.isNaN(awayScore) ? null : awayScore,
      week,
      type,
      round,
      error,
      warning,
    });
  }

  return {
    rows: out,
    ok: out.filter((r) => !r.error).length,
    errors: out.filter((r) => r.error).length,
    warnings: out.filter((r) => !r.error && r.warning).length,
  };
}
