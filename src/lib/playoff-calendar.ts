/**
 * When each playoff round kicks off, so nobody has to type it sixty times.
 *
 * The AHSAA publishes one calendar for the whole postseason: every first
 * round on the same Friday, every second round the Friday after, and then
 * eight championship games spread over four days in Tuscaloosa, each class
 * with its own slot. So the date of a bracket game is nearly always a
 * function of its class and its round, and typing it into each of the
 * thirty-odd games in a class is work the computer should be doing.
 *
 * These are defaults, not facts. Anything typed into a game's own Date or
 * Time wins, which is what a moved kickoff needs.
 *
 * **Rounds are counted from the end.** The last round of a class is its
 * championship whatever the bracket's size — the same rule the round names
 * follow — so a class that starts at sixteen takes the first three Fridays
 * and then its championship slot, and one that starts at thirty-two takes
 * four Fridays first. Nothing here needs to know which classes those are.
 */
import type { Classification } from "./types";

/**
 * The season these dates describe.
 *
 * A calendar is only ever right for one year, and a stale one is worse than
 * none: it would put last season's Fridays under this season's brackets with
 * nothing to show that it had. So the season is checked, and a bracket from
 * any other year simply gets no defaults — every game reads TBD until this
 * table is brought up to date, which is a visible, fixable state.
 */
export const CALENDAR_SEASON = "2026";

/** The rounds before the championship, in order. All at `ROUND_TIME`. */
export const ROUND_DATES = [
  "Fri, Nov 6",
  "Fri, Nov 13",
  "Fri, Nov 20",
  "Fri, Nov 27",
];

export const ROUND_TIME = "7:00 PM";

/** Championship week: four days, two games a day, one slot per class. */
export const CHAMPIONSHIPS: Partial<
  Record<Classification, { date: string; time: string }>
> = {
  A: { date: "Wed, Dec 2", time: "11:00 AM" },
  AA: { date: "Wed, Dec 2", time: "7:00 PM" },
  "1A": { date: "Thu, Dec 3", time: "11:00 AM" },
  "4A": { date: "Thu, Dec 3", time: "7:00 PM" },
  "2A": { date: "Fri, Dec 4", time: "11:00 AM" },
  "5A": { date: "Fri, Dec 4", time: "7:00 PM" },
  "3A": { date: "Sat, Dec 5", time: "11:00 AM" },
  "6A": { date: "Sat, Dec 5", time: "7:00 PM" },
};

export interface Kickoff {
  date: string;
  time: string;
}

/**
 * What a game in this round of this class starts at, if the calendar knows.
 *
 * `rounds` is how many rounds the class's bracket holds, because the
 * championship is the last one rather than a fixed number.
 */
export function defaultKickoff(
  season: string,
  cls: Classification,
  round: number,
  rounds: number,
): Kickoff | null {
  if (season !== CALENDAR_SEASON) return null;
  if (round < 1 || round > rounds) return null;
  if (round === rounds) return CHAMPIONSHIPS[cls] ?? null;
  const date = ROUND_DATES[round - 1];
  return date ? { date, time: ROUND_TIME } : null;
}
