/**
 * Finding the games that never arrived.
 *
 * A bad import rarely announces itself. When "Prattville HS" resolved to
 * Prattville Christian for two weeks, nothing failed: both rows wrote cleanly,
 * every count looked right, and the only visible symptom was a 6A school
 * quietly sitting out weeks it had actually played. With nearly 400 schools
 * that is not something anyone spots by reading the board.
 *
 * So this works backwards from the schedule: for every week that looks fully
 * loaded, which schools have no game in it?
 *
 * The hard part is that an open week is usually legitimate. AHSAA teams play
 * ten regular-season games across eleven weeks, so almost everyone sits out
 * once, and a check that flagged every bye would be noise. Two things keep the
 * signal clean:
 *
 *   - Weeks that are only partly loaded are excluded rather than blamed. Week
 *     zero is a genuinely short week — around 140 games against a full week's
 *     192, reaching 68% of the roster against 97% — so treating a team's
 *     absence from it as a fault would flag a third of the state. A week is
 *     judged against the fullest week loaded, not against a number hard-coded
 *     here, so a week the importer only half-finished is called out as thin
 *     instead of producing two hundred false alarms.
 *   - One open week and several are reported apart. One is a bye. Two or more,
 *     once several full weeks are in, is how a mis-matched name looks.
 */
import type { Game } from "./types";

export interface WeekCoverage {
  week: number;
  games: number;
  /** Distinct roster schools appearing in the week. */
  teams: number;
  /** False when the week holds far fewer schools than the fullest week. */
  complete: boolean;
}

export interface TeamGap {
  team: string;
  /** Complete weeks in which the school has no game. */
  missing: number[];
  /** Regular-season games recorded for the school, across all weeks. */
  played: number;
}

export interface CoverageReport {
  weeks: WeekCoverage[];
  /** Schools with two or more open weeks — the ones worth looking at. */
  suspect: TeamGap[];
  /** Schools with exactly one. Almost always a bye. */
  byes: TeamGap[];
  /** Schools with no regular-season game at all. */
  absent: string[];
  /** Weeks excluded from the check for holding too few schools. */
  thin: number[];
  /** How many complete weeks the answer rests on. */
  completeWeeks: number;
}

/**
 * A week counts as fully loaded at this share of the fullest week's coverage.
 *
 * Week zero reaches about 70% of a full week, so the cutoff sits above it with
 * room to spare; a week that has genuinely finished importing lands at 97-100%.
 */
const COMPLETE_AT = 0.8;

/** Below two complete weeks there is nothing to compare against. */
const MIN_WEEKS = 2;

export function findCoverage(games: Game[], roster: string[]): CoverageReport {
  const known = new Set(roster);
  // Playoffs are elimination — most of the state is absent by design, and a
  // team missing from a round is not a fault.
  const regular = games.filter((g) => g.type === "regular");

  const perWeek = new Map<number, { games: number; teams: Set<string> }>();
  const perTeam = new Map<string, Set<number>>();

  for (const g of regular) {
    const bucket = perWeek.get(g.week) ?? { games: 0, teams: new Set<string>() };
    bucket.games++;
    for (const name of [g.t1, g.t2]) {
      // Out-of-state and non-member opponents are stored by name but are not
      // on the roster; they have no schedule of their own to be missing from.
      if (!known.has(name)) continue;
      bucket.teams.add(name);
      const weeks = perTeam.get(name) ?? new Set<number>();
      weeks.add(g.week);
      perTeam.set(name, weeks);
    }
    perWeek.set(g.week, bucket);
  }

  const fullest = Math.max(0, ...[...perWeek.values()].map((w) => w.teams.size));
  const weeks: WeekCoverage[] = [...perWeek.entries()]
    .map(([week, w]) => ({
      week,
      games: w.games,
      teams: w.teams.size,
      complete: fullest > 0 && w.teams.size >= fullest * COMPLETE_AT,
    }))
    .sort((a, b) => a.week - b.week);

  const completeWeeks = weeks.filter((w) => w.complete).map((w) => w.week);
  const thin = weeks.filter((w) => !w.complete).map((w) => w.week);

  const gaps: TeamGap[] = [];
  const absent: string[] = [];

  // With one complete week, "missing" only means "had a bye that week", which
  // tells nobody anything. The weeks are still reported.
  if (completeWeeks.length >= MIN_WEEKS) {
    for (const team of roster) {
      const played = perTeam.get(team);
      if (!played?.size) {
        absent.push(team);
        continue;
      }
      const missing = completeWeeks.filter((w) => !played.has(w));
      if (missing.length) gaps.push({ team, missing, played: played.size });
    }
  }

  const order = (a: TeamGap, b: TeamGap) =>
    b.missing.length - a.missing.length || a.team.localeCompare(b.team);

  return {
    weeks,
    suspect: gaps.filter((g) => g.missing.length > 1).sort(order),
    byes: gaps.filter((g) => g.missing.length === 1).sort(order),
    absent: absent.sort((a, b) => a.localeCompare(b)),
    thin,
    completeWeeks: completeWeeks.length,
  };
}
