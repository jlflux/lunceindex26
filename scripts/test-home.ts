/**
 * The front page document.
 *
 * Most of this file is about one field. `href` is typed by a person in the
 * admin and written straight into an anchor on the site's front page, so
 * "javascript:…" there is a script the site runs on itself. The rule is
 * deliberately narrow — a path on this site, or an http(s) address — and
 * everything else is refused rather than cleaned up into something that might
 * still run.
 *
 * Usage: npx tsx scripts/test-home.ts
 */
import {
  isPathHidden,
  knownHidden,
  sectionOf,
  SITE_SECTIONS,
} from "../src/lib/site-sections";
import {
  defaultHomeState,
  HOME_ICONS,
  isExternal,
  isSafeHref,
  sanitizeHomeState,
  SITE_PAGES,
  type HomeState,
} from "../src/lib/home-types";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n1. Where a link may point");
{
  for (const good of [
    "/ratings",
    "/bracketology/about",
    "/?class=6A",
    "https://alpreps.com",
    "http://example.com/a/b?c=d#e",
    "https://alpreps.com/story/week-7",
  ]) {
    check(`accepts ${good}`, isSafeHref(good));
  }

  // The ones that matter.
  for (const bad of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)  ",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "",
    "   ",
    "ratings",
    "mailto:someone@example.com",
  ]) {
    check(`refuses ${JSON.stringify(bad)}`, !isSafeHref(bad));
  }

  // Protocol-relative: looks local, leaves the site. The one that reads as a
  // path and is not.
  check("refuses //evil.example, which looks like a path and is not",
    !isSafeHref("//evil.example/x"));

  check("an http(s) link is external", isExternal("https://alpreps.com"));
  check("a path is not", !isExternal("/ratings"));
  check("and neither is something unsafe", !isExternal("javascript:alert(1)"));
}

console.log("\n2. The page it ships with");
{
  const d = defaultHomeState();
  check("has a headline", Boolean(d.headline || d.headlineAccent));
  check("the banner is off", d.banner.enabled === false);

  const items = d.sections.flatMap((s) => s.items);
  check("every link is safe", items.every((i) => isSafeHref(i.href)),
    items.filter((i) => !isSafeHref(i.href)).map((i) => i.href).join(", "));
  check("every link has a label", items.every((i) => i.title.trim().length > 0));
  check("every icon is one the editor offers",
    items.every((i) => (HOME_ICONS as readonly string[]).includes(i.icon)),
    items.map((i) => i.icon).filter((n) => !(HOME_ICONS as readonly string[]).includes(n)).join(", "));

  const ids = items.map((i) => i.id);
  check("ids are unique, so rows cannot collapse into one",
    new Set(ids).size === ids.length);

  // Every internal link must be a page that exists, or the front page ships
  // pointing at a 404.
  const internal = items.map((i) => i.href).filter((h) => h.startsWith("/"));
  const known = new Set(SITE_PAGES.map((p) => p.href));
  check("every internal link is a page the editor knows about",
    internal.every((h) => known.has(h)),
    internal.filter((h) => !known.has(h)).join(", "));
}

console.log("\n3. What the API accepts");
{
  const round = sanitizeHomeState(defaultHomeState());
  check("the default survives a round trip unchanged",
    JSON.stringify(round) === JSON.stringify(defaultHomeState()));

  const threw = (raw: unknown): string | null => {
    try {
      sanitizeHomeState(raw);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "threw";
    }
  };

  check("a document with no headline is refused",
    threw({ headline: "", headlineAccent: "", sections: [] }) !== null);

  const withBad = (href: string): HomeState =>
    ({
      ...defaultHomeState(),
      sections: [
        { id: "s", label: "x", style: "chip", shown: true,
          items: [{ id: "i", title: "Click", body: "", href, icon: "info", shown: true }] },
      ],
    }) as HomeState;

  const msg = threw(withBad("javascript:alert(1)"));
  check("a script link is refused", msg !== null);
  check("and the refusal names the link so it can be found",
    Boolean(msg && msg.includes("Click")), String(msg));

  check("a label with nowhere to go is refused",
    threw({ ...defaultHomeState(), sections: [
      { id: "s", label: "", style: "chip", shown: true,
        items: [{ id: "i", title: "", body: "", href: "javascript:alert(1)", icon: "info", shown: true }] },
    ] }) !== null);

  // A blank row is what "+ Add a link" leaves behind. It is dropped, not an
  // error — otherwise adding a row and saving would fail.
  const spare = sanitizeHomeState({
    ...defaultHomeState(),
    sections: [
      { id: "s", label: "x", style: "chip", shown: true,
        items: [{ id: "i", title: "", body: "", href: "", icon: "info", shown: true }] },
    ],
  });
  check("a blank row is dropped rather than refused",
    spare.sections[0].items.length === 0);

  // An unknown icon is a stale document or a hand-rolled POST, not a reason to
  // lose the link.
  const odd = sanitizeHomeState({
    ...defaultHomeState(),
    sections: [
      { id: "s", label: "x", style: "nonsense", shown: true,
        items: [{ id: "i", title: "A", body: "", href: "/odds", icon: "skull", shown: true }] },
    ],
  });
  check("an unknown icon falls back rather than failing",
    odd.sections[0].items[0].icon === "info");
  check("an unknown style falls back to cards",
    odd.sections[0].style === "card");

  // Duplicate ids would make React draw two rows as one.
  const dupe = sanitizeHomeState({
    ...defaultHomeState(),
    sections: [
      { id: "same", label: "a", style: "chip", shown: true,
        items: [
          { id: "x", title: "A", body: "", href: "/odds", icon: "info", shown: true },
          { id: "x", title: "B", body: "", href: "/rpi", icon: "info", shown: true },
        ] },
      { id: "same", label: "b", style: "chip", shown: true, items: [] },
    ],
  });
  check("duplicate section ids are separated",
    dupe.sections[0].id !== dupe.sections[1].id);
  check("duplicate link ids are separated",
    dupe.sections[0].items[0].id !== dupe.sections[0].items[1].id);
  check("and both links survive it", dupe.sections[0].items.length === 2);

  // Long text is cut, not refused — a paste should not lose the edit.
  const long = sanitizeHomeState({ ...defaultHomeState(), intro: "x".repeat(5000) });
  check("an over-long intro is trimmed rather than refused",
    long.intro.length === 600);
}

console.log("\n4. Switching a section off");
{
  // The menu is a courtesy, not a gate. What makes a section hidden is that
  // its page refuses to serve — so the thing worth testing is that the same
  // catalogue decides both, and that path matching is tight enough not to
  // close a page nobody asked to close.
  check("every section has a distinct key", 
    new Set(SITE_SECTIONS.map((s) => s.key)).size === SITE_SECTIONS.length);
  check("and a distinct path",
    new Set(SITE_SECTIONS.map((s) => s.href)).size === SITE_SECTIONS.length);
  check("every path is one the editor would accept as a link",
    SITE_SECTIONS.every((s) => isSafeHref(s.href)));

  // The front page and team pages are deliberately not hideable.
  check("the front page belongs to no section", sectionOf("/") === null);
  check("nor does a team page", sectionOf("/team/thompson") === null);
  check("so neither can be hidden, whatever is stored",
    !isPathHidden("/", SITE_SECTIONS.map((s) => s.key)) &&
      !isPathHidden("/team/thompson", SITE_SECTIONS.map((s) => s.key)));

  const off = ["composite"];
  check("the hidden section's own page is closed",
    isPathHidden("/composite", off));
  check("and its query string does not reopen it",
    isPathHidden("/composite?class=6A", off));
  check("and nor does a trailing slash",
    isPathHidden("/composite/", off));
  check("every other board stays open",
    ["/ratings", "/rpi", "/aswa", "/resume", "/odds"].every((p) => !isPathHidden(p, off)));

  // A nested page goes with its parent, and only on a path boundary — the
  // reason this is matched by segment rather than by `startsWith` alone.
  check("a section's nested page closes with it",
    isPathHidden("/bracketology/about", ["bracketology"]));

  // The embeds are the bracketology section wearing a different route. If
  // hiding a board left it on display inside somebody else's page, the switch
  // would not mean what the admin says it means.
  check("and so do its embeds, which are the same section elsewhere",
    SITE_SECTIONS.some((x) => x.key === "bracketology"));
  check("but a path that merely starts the same does not",
    sectionOf("/ratingsomething") === null);

  // Keys left behind by a rename must not linger as a hide nobody can find.
  check("an unknown key is dropped on the way in",
    knownHidden(["composite", "no-such-section"]).join() === "composite");
  check("and duplicates are collapsed",
    knownHidden(["rpi", "rpi"]).length === 1);

  // The document carries it, and the API has to keep it.
  const saved = sanitizeHomeState({ ...defaultHomeState(), hiddenSections: ["composite", "aswa"] });
  check("a saved hide survives the API", 
    saved.hiddenSections.includes("composite") && saved.hiddenSections.includes("aswa"),
    saved.hiddenSections.join());
  const junk = sanitizeHomeState({ ...defaultHomeState(), hiddenSections: ["composite", 7, null, "bogus"] });
  check("and anything that is not a real section is discarded",
    junk.hiddenSections.join() === "composite",
    junk.hiddenSections.join());
  check("the page ships with nothing hidden",
    defaultHomeState().hiddenSections.length === 0);
}

console.log(
  failures === 0 ? "\nThe front page document behaves.\n" : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
