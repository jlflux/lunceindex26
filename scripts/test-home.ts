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

console.log(
  failures === 0 ? "\nThe front page document behaves.\n" : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
