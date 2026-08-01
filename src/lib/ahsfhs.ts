/**
 * Parsing team pages from ahsfhs.org (Alabama High School Football History).
 *
 * The AHSAA's own weekly PDFs are missing games outright, so this is the
 * fuller schedule source. Each team has a page at
 *   https://www.ahsfhs.org/teams2/teampage.asp?year=&Team=<name>
 * carrying a "<year> Season" table of that team's whole schedule.
 *
 * Two things to know about the source:
 *
 *  - It covers AISA and defunct programs as well as AHSAA members, so every
 *    opponent must be matched against the roster rather than trusted. That is
 *    the caller's job — this module only reads the page.
 *  - Every game appears on both teams' pages. Orientation is taken from the
 *    "@" / "vs." marker so the same fixture produces the same home/away pair
 *    from either side, and the games upsert collapses the duplicate.
 *
 * Result columns are parsed when present. That path is unverified: the sample
 * page was captured before the season began, so no played row existed to read.
 */

/** Season opener used to turn a calendar date into an AHSAA week number. */
export interface SeasonAnchor {
  year: number;
  /** The Friday of Week 0. 2026: August 21. */
  week0: string;
}

export const DEFAULT_ANCHOR: SeasonAnchor = { year: 2026, week0: "2026-08-21" };

export interface AhsfhsGame {
  /** As printed, e.g. "8/21". */
  dateLabel: string;
  /** ISO date, or null if the label could not be read. */
  date: string | null;
  week: number | null;
  /** True when the listed team hosts. */
  isHome: boolean;
  /** Opponent exactly as printed, before roster matching. */
  opponentRaw: string;
  /** Marked with an asterisk on the source page. */
  regionGame: boolean;
  result: "W" | "L" | "T" | null;
  teamScore: number | null;
  oppScore: number | null;
}

export interface AhsfhsPage {
  /** Team name as the source spells it. */
  team: string | null;
  season: number | null;
  games: AhsfhsGame[];
  /** Rows recognised but skipped, with the reason. */
  skipped: { text: string; reason: string }[];
}

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Headings that reliably come after the schedule and never inside it.
 *
 * The slice used to stop at whichever heading came next, which assumed the
 * schedule table contains no headings of its own. That assumption is not the
 * site's to keep — anything the site adds mid-table (a promo panel, a "next
 * game" marker) truncates the schedule at that point, and a truncation right
 * after the opener leaves precisely one game per team.
 */
const SCHEDULE_END = /season\s+totals|standings|by\s+the\s+decade|border\s+wars/i;

/**
 * Slices out one `colorbar` section.
 *
 * Runs to the next heading that looks like the end of the schedule, and only
 * falls back to "the very next heading" when no such marker exists.
 */
function section(html: string, heading: RegExp): string | null {
  const bar = /<td[^>]*class="colorbar"[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  let start = -1;
  let nextBar = -1;
  let end = -1;

  while ((m = bar.exec(html))) {
    const label = text(m[1]);
    if (start < 0) {
      if (heading.test(label)) start = m.index + m[0].length;
      continue;
    }
    if (nextBar < 0) nextBar = m.index;
    if (SCHEDULE_END.test(label)) {
      end = m.index;
      break;
    }
  }

  if (start < 0) return null;
  // No end marker at all → the old behaviour, which is still right for a page
  // whose schedule really is followed by unrelated content.
  const stop = end >= 0 ? end : nextBar >= 0 ? nextBar : html.length;
  return html.slice(start, stop);
}

/**
 * Every `colorbar` heading on the page, in order.
 *
 * The schedule is sliced out by heading — from "<year> Season" to whatever
 * heading comes next — so when a page yields the wrong games, the list of
 * headings is the first thing worth seeing. There is no way to guess it from
 * here: the site cannot be reached from the build environment.
 */
export function sectionHeadings(html: string): string[] {
  const bar = /<td[^>]*class="colorbar"[^>]*>([\s\S]*?)<\/td>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = bar.exec(html))) out.push(text(m[1]));
  return out;
}

function weekFor(iso: string | null, anchor: SeasonAnchor): number | null {
  if (!iso) return null;
  const d = Date.parse(`${iso}T00:00:00Z`);
  const w0 = Date.parse(`${anchor.week0}T00:00:00Z`);
  if (!Number.isFinite(d) || !Number.isFinite(w0)) return null;
  // Rounding absorbs Thursday and Saturday games into their Friday's week.
  const week = Math.round((d - w0) / (7 * 86_400_000));
  return week >= 0 && week <= 20 ? week : null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * A date cell plus the season year → an ISO date.
 *
 * Two shapes, because the two pages that carry a schedule do not agree:
 * the team page writes "8/21", the games-by-year page "Fri., Aug. 21".
 */
function isoDate(label: string, year: number): string | null {
  const slash = label.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slash) {
    const mm = String(Number(slash[1])).padStart(2, "0");
    const dd = String(Number(slash[2])).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  }

  const named = label.match(
    /^(?:[A-Za-z]{3,9}\.?,?\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2})$/,
  );
  if (named) {
    const mm = MONTHS[named[1].slice(0, 3).toLowerCase()];
    if (!mm) return null;
    return `${year}-${String(mm).padStart(2, "0")}-${String(
      Number(named[2]),
    ).padStart(2, "0")}`;
  }

  return null;
}

/** Whether a cell looks like either date form. */
const isDateCell = (s: string) => isoDate(s, 2000) !== null;

export function parseAhsfhsTeamPage(
  html: string,
  anchor: SeasonAnchor = DEFAULT_ANCHOR,
): AhsfhsPage {
  const skipped: { text: string; reason: string }[] = [];

  // Which team the page belongs to — only ever from a self-referential link.
  //
  // NOT from a bare `teampage.asp?Team=` link: on the team page every opponent
  // in the schedule is one of those, and the first is an opponent rather than
  // the subject. Reading those made Abbeville's page look like Headland's.
  //
  // The print-schedule link identifies the team page; the "all years" link,
  // recognisable by its empty Year, identifies the games-by-year page, where
  // opponents link through gamesbyyear.asp instead.
  const teamMatch =
    html.match(/Printschedule2\.asp\?year=\d*&(?:amp;)?team=([^"'&\s]+)/i) ??
    html.match(
      /gamesbyyear\.asp\?p=1&(?:amp;)?Year=&(?:amp;)?Team=([^"'&\s]+)/i,
    ) ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const raw = teamMatch
    ? decodeURIComponent(teamMatch[1].replace(/\+/g, " "))
        // Titles read "Abbeville High School Football History".
        .replace(/\s+football\s+history\s*$/i, "")
        .replace(/\s+high\s+school\s*$/i, "")
        .trim()
    : null;
  // The games-by-year page's title is the site's own, identical on every
  // page. Better to report no team than to report every school as "Alabama".
  const team = raw && !/^alabama$/i.test(raw) ? raw : null;

  // Anchored at both ends on purpose: the same page also carries "2026 Season
  // Preview" and "2026 Season Totals", neither of which is the schedule.
  const seasonHeading = new RegExp(`^${anchor.year}\\s+Season$`, "i");
  const body = section(html, seasonHeading);
  if (!body) {
    return {
      team,
      season: null,
      games: [],
      skipped: [
        { text: "", reason: `No "${anchor.year} Season" table on the page.` },
      ],
    };
  }

  const games: AhsfhsGame[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;

  while ((row = rowRe.exec(body))) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      text(c[1]),
    );
    if (cells.length < 2) continue;

    const dateLabel = cells[0];
    if (!isDateCell(dateLabel)) continue;

    const opponentCell = cells[1];
    if (/^open$/i.test(opponentCell.replace(/\*/g, "").trim())) {
      continue; // bye week
    }

    // "@ Pace FL" · "vs. Baldwin County *"
    const away = /^@/.test(opponentCell);
    const home = /^vs\.?/i.test(opponentCell);
    if (!away && !home) {
      skipped.push({
        text: `${dateLabel} ${opponentCell}`,
        reason: "No @ or vs. marker — cannot tell home from away",
      });
      continue;
    }

    const regionGame = opponentCell.includes("*");
    const opponentRaw = opponentCell
      .replace(/^@|^vs\.?/i, "")
      .replace(/\*/g, "")
      .trim();

    if (!opponentRaw) {
      skipped.push({
        text: `${dateLabel} ${opponentCell}`,
        reason: "Empty opponent",
      });
      continue;
    }

    // Trailing cells hold the outcome once a game has been played.
    const rest = cells.slice(2).join(" ");
    const resultMatch = rest.match(/\b([WLT])\b/);
    const scoreMatch = rest.match(/\b(\d{1,3})\s*-\s*(\d{1,3})\b/);

    const date = isoDate(dateLabel, anchor.year);
    games.push({
      dateLabel,
      date,
      week: weekFor(date, anchor),
      isHome: home,
      opponentRaw,
      regionGame,
      result: (resultMatch?.[1] as "W" | "L" | "T") ?? null,
      teamScore: scoreMatch ? Number(scoreMatch[1]) : null,
      oppScore: scoreMatch ? Number(scoreMatch[2]) : null,
    });
  }

  return { team, season: anchor.year, games, skipped };
}

/**
 * Roster name → the name ahsfhs.org files the team under.
 *
 * Only for names that differ in substance. Punctuation disagreements —
 * hyphens, periods, apostrophes — do not belong here; `ahsfhsCandidates`
 * below generates those. `names.ts` derives the reverse direction from this
 * same map so the school is also recognised when it turns up as somebody
 * else's opponent.
 *
 * Dothan is the instructive one: ahsfhs moved the program to a "Dothan High"
 * page after a merger, so the bare name no longer resolves.
 */
export const AHSFHS_NAMES: Record<string, string | string[]> = {
  Dothan: "Dothan High",
  Phillips: "Phillips Bear Creek",
  "Lindsay Lane": "Lindsay Lane Christian",
  "West End": "West End Walnut Grove",
  "Montgomery Catholic": "Catholic Montgomery",
  Berry: "Berry Fayette",
  "Hope Christian": "Hope Christian Academy",
  // The roster drops a trailing "Academy" or "School" that ahsfhs.org keeps.
  "Lee-Scott": "Lee-Scott Academy",
  "Northside Methodist": "Northside Methodist Academy",
  "University Charter": "University Charter School",
  "Fort Dale": "Fort Dale Academy",
  "Decatur Heritage": [
    "Decatur Heritage Christian",
    "Decatur Heritage Christian Academy",
  ],
};

/** The mapped spellings for a roster name, most likely first. */
export function ahsfhsNamesFor(rosterName: string): string[] {
  const v = AHSFHS_NAMES[rosterName];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

/** "BB Comer" → "B.B. Comer", "DAR" → "D.A.R.". */
const dotInitials = (s: string) =>
  s.replace(
    /^([A-Z]{2,3})(\s|$)/,
    (_, letters: string, tail: string) =>
      `${letters.split("").join(".")}.${tail}`,
  );

/** The reverse, for a roster that spells the initials out. */
const bareInitials = (s: string) =>
  s.replace(/^([A-Z])\.\s?([A-Z])\.(\s|$)/, "$1$2$3");

/** Most teams resolve on the first try, so there is little point going deeper. */
const MAX_CANDIDATES = 6;

/**
 * Plausible ahsfhs.org spellings of a roster name, best guess first.
 *
 * The two lists disagree mostly about punctuation, and always in the same few
 * ways: we write "Carver-Montgomery" where they write "Carver Montgomery", and
 * "BB Comer" where they write "B.B. Comer". Rather than hand-maintain 393
 * mappings, the fetch walks these candidates until a page comes back — the
 * first entry is what we already believed, so a correctly spelled team costs
 * exactly one request as before.
 *
 * `AHSFHS_NAMES` still wins where the difference is not punctuation at all
 * ("Dothan" → "Dothan High"); its value becomes the base the variants are
 * built from.
 */
export function ahsfhsCandidates(rosterName: string): string[] {
  const mapped = ahsfhsNamesFor(rosterName);
  // A mapped name replaces the roster name rather than joining it. Dothan is
  // why: their bare "Dothan" page still exists and is the wrong program.
  const bases = mapped.length ? mapped : [rosterName];
  const out: string[] = [];
  const add = (s: string) => {
    const v = s.replace(/\s+/g, " ").trim();
    if (v && !out.includes(v)) out.push(v);
  };

  for (const base of bases) {
    for (const hyphen of [base, base.replace(/-/g, " ")]) {
      for (const form of [hyphen, dotInitials(hyphen), bareInitials(hyphen)]) {
        add(form);
        add(form.replace(/['’]/g, "")); // "St. Paul's" → "St. Pauls"
        add(form.replace(/\./g, ""));
        add(form.replace(/['’.]/g, ""));
      }
    }
  }
  return out.slice(0, MAX_CANDIDATES);
}

/**
 * The page URL for one candidate spelling.
 *
 * Points at gamesbyyear.asp, not the team page. The team page carries a
 * "<year> Season" panel that showed the whole schedule before the season and
 * collapsed to the next fixture alone once the site published its season
 * previews — a roster's worth of week-0-only imports. The games-by-year page
 * is the full fixture list and is scoped to one season by the URL, so it does
 * not change shape as the year progresses.
 */
export function ahsfhsUrl(
  sourceName: string,
  year: number = DEFAULT_ANCHOR.year,
): string {
  return `https://www.ahsfhs.org/Teams2/gamesbyyear.asp?Team=${encodeURIComponent(
    sourceName,
  )}&Year=${year}`;
}
