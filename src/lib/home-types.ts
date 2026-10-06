/**
 * The shape of the hand-authored front page.
 *
 * Same idea as `bracket-types.ts`: this file describes only what a person
 * typed. Nothing computed lives here — the top five, the team count and the
 * updated stamp are read off the published snapshot when the page renders, so
 * a number stored in this document would be a second answer to a question the
 * rest of the site already answers.
 *
 * Split from the page so the admin's client components can import the types
 * without pulling the page's data loading into the browser bundle.
 */
import type { IconName } from "@/components/Icon";

/** The three ways the front page can draw a group of links. */
export const HOME_STYLES = ["card", "board", "chip"] as const;
export type HomeStyle = (typeof HOME_STYLES)[number];

export const HOME_STYLE_LABELS: Record<HomeStyle, string> = {
  card: "Big cards, with an icon and a sentence",
  board: "Small cards, a name and one line",
  chip: "Buttons, label only",
};

/**
 * Icons the editor offers.
 *
 * A subset of `IconName` on purpose: the full set includes the chrome's own
 * glyphs (sign-out, close, the theme toggles) which mean something specific
 * elsewhere and would read as a mistake on a link.
 */
export const HOME_ICONS = [
  "trophy", "chart", "list", "grid", "users", "calendar",
  "info", "shield", "database", "search", "clock", "check",
] as const satisfies readonly IconName[];

export interface HomeItem {
  /** Stable across edits, so React keys and reordering behave. */
  id: string;
  title: string;
  /** The sentence under a card, or the one line under a board name. */
  body: string;
  /** A path on this site ("/odds") or an absolute http(s) URL. */
  href: string;
  icon: IconName;
  shown: boolean;
}

export interface HomeSection {
  id: string;
  label: string;
  style: HomeStyle;
  shown: boolean;
  items: HomeItem[];
}

export interface HomeState {
  /** The plain first half of the headline. */
  headline: string;
  /** The half drawn in the brand colour. May be empty. */
  headlineAccent: string;
  intro: string;
  /** Off by default, so an announcement is a deliberate act. */
  banner: { enabled: boolean; text: string };
  /** The search box earns its place, but it is still the author's call. */
  showSearch: boolean;
  /** The live top five off the published board. */
  showTopFive: boolean;
  topFiveLabel: string;
  sections: HomeSection[];
}

/**
 * Where a link may point.
 *
 * An href goes into the page as an href, so this is the one field where a
 * typo is worse than wrong — "javascript:…" in an anchor is a script the site
 * runs on its own front page. Only two shapes are allowed: a path on this
 * site, or an absolute http(s) URL. Everything else is refused at the API
 * rather than sanitised into something that might still run.
 */
export function isSafeHref(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  // A path on this site. Not "//evil.example" — that is protocol-relative and
  // leaves the site while looking local.
  if (s.startsWith("/") && !s.startsWith("//")) return true;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Whether a link leaves the site, so it can be marked and opened safely. */
export function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}

/** The pages of this site, for the editor's dropdown. */
export const SITE_PAGES: { href: string; label: string }[] = [
  { href: "/ratings", label: "Power Index" },
  { href: "/resume", label: "Résumé" },
  { href: "/rpi", label: "RPI" },
  { href: "/composite", label: "Composite" },
  { href: "/aswa", label: "ASWA" },
  { href: "/teams", label: "Region Standings" },
  { href: "/bracketology", label: "Bracketology" },
  { href: "/bracketology/about", label: "Bracketology — how to read it" },
  { href: "/odds", label: "Playoff Odds" },
  { href: "/schedule", label: "Schedule & results" },
  { href: "/about", label: "How the Index works" },
];

let seq = 0;
/** An id that is unique within one editing session. */
export function newId(prefix = "i"): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

/**
 * The page as it shipped.
 *
 * This is the fallback whenever the table is missing or empty, which means a
 * deployment that has not run 007 still renders a complete front page rather
 * than a blank one — the same forgiveness `loadBracket` gives the bracket.
 */
export function defaultHomeState(): HomeState {
  const item = (
    id: string,
    title: string,
    body: string,
    href: string,
    icon: IconName,
  ): HomeItem => ({ id, title, body, href, icon, shown: true });

  return {
    headline: "Alabama high school football,",
    headlineAccent: "ranked and measured",
    intro:
      "Power ratings for every AHSAA team, region standings, playoff odds and a bracket — rebuilt every time a score comes in.",
    banner: { enabled: false, text: "" },
    showSearch: true,
    showTopFive: true,
    topFiveLabel: "Top of the Index",
    sections: [
      {
        id: "start",
        label: "Start here",
        style: "card",
        shown: true,
        items: [
          item("start-index", "Power Index",
            "Every team rated and ranked, with strength of schedule behind it.",
            "/ratings", "trophy"),
          item("start-standings", "Region Standings",
            "Who is winning the region games that decide the playoff field.",
            "/teams", "list"),
          item("start-bracket", "Bracketology",
            "The playoff field as it stands, region by region, laid out by hand.",
            "/bracketology", "grid"),
          item("start-odds", "Playoff Odds",
            "Ten thousand simulated seasons: seeds, byes and how far each team goes.",
            "/odds", "chart"),
        ],
      },
      {
        id: "boards",
        label: "Five ways to rank a team",
        style: "board",
        shown: true,
        items: [
          item("b-index", "Power Index", "Who is best right now", "/ratings", "trophy"),
          item("b-resume", "Résumé", "Who has earned it", "/resume", "trophy"),
          item("b-rpi", "RPI", "What the schedule alone implies", "/rpi", "chart"),
          item("b-composite", "Composite", "Where the polls agree", "/composite", "list"),
          item("b-aswa", "ASWA", "The sportswriters' poll", "/aswa", "users"),
          item("b-about", "How it works",
            "What each one measures, and why they differ", "/about", "info"),
        ],
      },
      {
        id: "also",
        label: "Also here",
        style: "chip",
        shown: true,
        items: [
          item("a-schedule", "Schedule & results", "", "/schedule", "calendar"),
          item("a-teams", "Every team", "", "/teams", "users"),
          item("a-bkt-about", "Reading the bracket", "", "/bracketology/about", "info"),
          item("a-about", "How the Index works", "", "/about", "info"),
        ],
      },
    ],
  };
}

/**
 * Validate and normalise a posted document.
 *
 * Here rather than in the route so it can be tested without standing up a
 * request. The route is the only caller today, but the rule it enforces —
 * above all that an `href` is a path or an http(s) address and nothing else —
 * is the kind that has to be right every time, not the kind to re-read in a
 * handler and hope.
 *
 * Throws with a message naming the offending link, because the editor shows
 * that message to the person who typed it.
 */
export function sanitizeHomeState(raw: unknown): HomeState {
  const r = (raw ?? {}) as Partial<HomeState>;
  if (!raw || typeof raw !== "object") throw new Error("Expected a front page.");

  const str = (v: unknown, max: number): string =>
    typeof v === "string" ? v.slice(0, max) : "";

  const fallback = defaultHomeState();
  const banner = r.banner as { enabled?: unknown; text?: unknown } | undefined;

  const state: HomeState = {
    headline: str(r.headline, 160),
    headlineAccent: str(r.headlineAccent, 160),
    intro: str(r.intro, 600),
    banner: {
      enabled: banner?.enabled === true,
      text: str(banner?.text, 300),
    },
    showSearch: r.showSearch !== false,
    showTopFive: r.showTopFive !== false,
    topFiveLabel: str(r.topFiveLabel, 60) || fallback.topFiveLabel,
    sections: [],
  };

  if (!state.headline.trim() && !state.headlineAccent.trim()) {
    throw new Error("The headline cannot be empty.");
  }

  const seenSection = new Set<string>();

  for (const rs of (Array.isArray(r.sections) ? r.sections : []) as Partial<HomeSection>[]) {
    if (!rs || typeof rs !== "object") continue;

    const style = (HOME_STYLES as readonly string[]).includes(rs.style as string)
      ? (rs.style as HomeStyle)
      : "card";

    // Ids only have to be unique, not meaningful — they key React rows and
    // nothing else. A collision would make two rows share a key and render as
    // one, so a repeat is renamed rather than refused.
    let id = str(rs.id, 60).trim() || newId("s");
    while (seenSection.has(id)) id = newId("s");
    seenSection.add(id);

    const items: HomeItem[] = [];
    const seenItem = new Set<string>();

    for (const ri of (Array.isArray(rs.items) ? rs.items : []) as Partial<HomeItem>[]) {
      if (!ri || typeof ri !== "object") continue;

      const title = str(ri.title, 80).trim();
      const href = str(ri.href, 500).trim();
      // A row with no words and nowhere to go is a spare in the editor, not an
      // error: "+ Add a link" leaves one behind by design.
      if (!title && !href) continue;
      if (!title) throw new Error(`A link to "${href}" has no label.`);
      if (!isSafeHref(href)) {
        throw new Error(
          `"${title}" points at "${href}", which is neither a path on this site ` +
            `(starting with /) nor an http(s) address.`,
        );
      }

      let iid = str(ri.id, 60).trim() || newId();
      while (seenItem.has(iid)) iid = newId();
      seenItem.add(iid);

      items.push({
        id: iid,
        title,
        body: str(ri.body, 300),
        href,
        icon: ((HOME_ICONS as readonly string[]).includes(ri.icon as string)
          ? ri.icon
          : "info") as IconName,
        shown: ri.shown !== false,
      });
    }

    state.sections.push({
      id,
      label: str(rs.label, 80),
      style,
      shown: rs.shown !== false,
      items,
    });
  }

  return state;
}
