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

/** Slices out one `colorbar` section, up to wherever the next one starts. */
function section(html: string, heading: RegExp): string | null {
  const bar = /<td[^>]*class="colorbar"[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  let start = -1;
  let end = html.length;

  while ((m = bar.exec(html))) {
    const label = text(m[1]);
    if (start < 0 && heading.test(label)) {
      start = m.index + m[0].length;
      continue;
    }
    if (start >= 0) {
      end = m.index;
      break;
    }
  }
  return start < 0 ? null : html.slice(start, end);
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

/** "8/21" plus the season year → an ISO date. */
function isoDate(label: string, year: number): string | null {
  const m = label.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const mm = String(Number(m[1])).padStart(2, "0");
  const dd = String(Number(m[2])).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function parseAhsfhsTeamPage(
  html: string,
  anchor: SeasonAnchor = DEFAULT_ANCHOR,
): AhsfhsPage {
  const skipped: { text: string; reason: string }[] = [];

  // The page title carries the team, e.g. "…?Team=Fairhope".
  const teamMatch =
    html.match(/teampage\.asp\?year=&(?:amp;)?Team=([^"'&\s]+)/i) ??
    html.match(/Printschedule2\.asp\?year=\d+&(?:amp;)?team=([^"'&\s]+)/i);
  const team = teamMatch
    ? decodeURIComponent(teamMatch[1].replace(/\+/g, " ")).trim()
    : null;

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
    if (!/^\d{1,2}\/\d{1,2}$/.test(dateLabel)) continue;

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
 * Only entries where the two disagree. A wrong name here is an HTTP 500 on
 * the fetch, which is how these were found. `names.ts` derives the reverse
 * direction from this same map so the school is also recognised when it turns
 * up as somebody else's opponent.
 *
 * Dothan is the instructive one: ahsfhs moved the program to a "Dothan High"
 * page after a merger, so the bare name no longer resolves.
 */
export const AHSFHS_NAMES: Record<string, string> = {
  Dothan: "Dothan High",
  Phillips: "Phillips Bear Creek",
  "Lindsay Lane": "Lindsay Lane Christian",
  "West End": "West End Walnut Grove",
  "Montgomery Catholic": "Catholic Montgomery",
  Berry: "Berry Fayette",
};

/** The page URL for a roster team. */
export function ahsfhsUrl(rosterName: string): string {
  const source = AHSFHS_NAMES[rosterName] ?? rosterName;
  return `https://www.ahsfhs.org/teams2/teampage.asp?year=&Team=${encodeURIComponent(source)}`;
}
