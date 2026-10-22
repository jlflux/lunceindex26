/**
 * The parts of the public site that can be switched off.
 *
 * One catalogue, read by three things that must not disagree: the nav that
 * offers a link, the page that serves it, and the admin that hides it. Keeping
 * the list in the nav alone was how a hidden section could still be reachable
 * by typing its address — the menu is a courtesy, not a gate.
 *
 * `/` is deliberately absent. It is the site's front door, it is where the
 * notice about a missing board would go, and a site whose root 404s is a site
 * that looks broken rather than one with a board temporarily down.
 *
 * Team pages are absent too. They are reached from every board and from the
 * front page search, they carry nothing that belongs to one section, and
 * taking them down to hide a poll would be a far bigger act than intended.
 */
export interface SiteSection {
  /** Stored in the document. Stable — renaming one orphans a stored hide. */
  key: string;
  /** Where it lives. Also the prefix that decides what the hide covers. */
  href: string;
  /** As the nav says it. */
  label: string;
  /** Which nav row it belongs to: the boards, or the supporting pages. */
  row: "rankings" | "pages";
  /** What the admin says it is, for somebody deciding whether to hide it. */
  note: string;
}

export const SITE_SECTIONS: SiteSection[] = [
  { key: "ratings", href: "/ratings", label: "Power Index", row: "rankings",
    note: "The main board. Hiding it also removes the front page's link to it." },
  { key: "resume", href: "/resume", label: "Résumé", row: "rankings",
    note: "Who has earned it." },
  { key: "rpi", href: "/rpi", label: "RPI", row: "rankings",
    note: "What the schedule alone implies." },
  { key: "composite", href: "/composite", label: "Composite", row: "rankings",
    note: "Your rank averaged with four outside polls." },
  { key: "aswa", href: "/aswa", label: "ASWA", row: "rankings",
    note: "The sportswriters' poll." },
  { key: "teams", href: "/teams", label: "Standings", row: "pages",
    note: "Region standings for every class." },
  { key: "bracketology", href: "/bracketology", label: "Bracketology", row: "pages",
    note: "The bracket and the region write-ups. Takes its about page with it." },
  { key: "odds", href: "/odds", label: "Playoff Odds", row: "pages",
    note: "The simulated seeds and runs." },
  { key: "schedule", href: "/schedule", label: "Schedule", row: "pages",
    note: "Fixtures and results by week." },
  { key: "about", href: "/about", label: "How It Works", row: "pages",
    note: "The explainer. Also the footer link." },
];

const BY_KEY = new Map(SITE_SECTIONS.map((s) => [s.key, s]));

/**
 * Which section a path belongs to, if any.
 *
 * Prefix matching on a path boundary, so `/bracketology/about` belongs to
 * bracketology while `/ratingsomething` belongs to nothing. An unknown path —
 * `/`, a team page — has no section and is never hidden.
 */
export function sectionOf(path: string): SiteSection | null {
  const p = (path.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  for (const s of SITE_SECTIONS) {
    if (p === s.href || p.startsWith(`${s.href}/`)) return s;
  }
  return null;
}

/** Whether a path is switched off. Anything outside the catalogue is not. */
export function isPathHidden(path: string, hidden: readonly string[]): boolean {
  const s = sectionOf(path);
  return s ? hidden.includes(s.key) : false;
}

/** Drops hidden keys that no longer name a section, so the UI cannot show a ghost. */
export function knownHidden(hidden: readonly string[]): string[] {
  return [...new Set(hidden.filter((k) => BY_KEY.has(k)))];
}
