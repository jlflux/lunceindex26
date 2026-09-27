/**
 * A small allowlist sanitiser for the one piece of stored HTML on the site.
 *
 * The bracketology explainer is written as HTML in the admin and rendered into
 * a page, which makes it the only place here where markup comes out of the
 * database. That is worth sanitising even though the only person who can write
 * it is signed in: an admin session is one compromised password away from
 * being someone else's, and "we trust the author" is the sentence under most
 * stored-XSS bugs. It also catches the ordinary case — a paste out of a word
 * processor carrying a pile of junk attributes.
 *
 * Deliberately conservative and deliberately small. Anything not on the lists
 * below is dropped, tags included, and dropping a tag keeps its text. There is
 * no DOM on the server, so this walks the markup itself rather than parsing it
 * into a tree — which is why the allowlist is a fixed set of simple inline and
 * block tags rather than anything that could nest meaningfully wrong.
 */

/** Tags that survive. Everything else is unwrapped, keeping its text. */
const ALLOWED = new Set([
  "p", "br", "h2", "h3", "h4",
  "ul", "ol", "li",
  "strong", "b", "em", "i", "u",
  "a", "span", "blockquote", "hr",
]);

/** Tags whose entire contents go, not just the tag. */
const STRIP_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "svg"]);

/**
 * Tags that may carry a colour.
 *
 * Text-bearing ones only. There is no reason to colour a `<ul>` or an `<hr>`,
 * and every attribute allowed somewhere it is not needed is surface area on
 * the one piece of markup here that comes out of the database.
 */
const COLOURABLE = new Set([
  "span", "strong", "b", "em", "i", "u",
  "p", "h2", "h3", "h4", "li", "a", "blockquote",
]);

/**
 * Named colours the explainer may use.
 *
 * Each is defined in `globals.css` against a theme token, so it redefines
 * itself when the light/dark toggle flips. A hand-picked hex cannot do that —
 * it is one colour in both themes — so these exist for the common cases and
 * the hex escape hatch below exists for the rest.
 */
export const PROSE_COLOURS = [
  "c-brand",
  "c-good",
  "c-warn",
  "c-bad",
  "c-muted",
  "c-strong",
] as const;
const CLASS_ALLOWED = new Set<string>(PROSE_COLOURS);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
};

/** Only these can start an href. Anything else — javascript:, data: — is dropped. */
const SAFE_HREF = /^(https?:\/\/|mailto:|\/|#)/i;

/**
 * A colour value we are willing to put back into the document.
 *
 * Rebuilt from a match rather than passed through, which is what makes the
 * rest of a `style` attribute unable to ride along. Three shapes and nothing
 * else: a hex, a functional notation whose arguments are numeric, or a bare
 * keyword. `expression(...)`, `url(javascript:...)`, a backslash escape, a
 * comment, a second declaration — none of them can match any of the three.
 */
const COLOUR_VALUE =
  /^(#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9., %/]+\)|[a-z]{3,20})$/i;

/**
 * Keeps the colour out of a style attribute and discards everything else.
 *
 * Forgiving by design about what surrounds it: a paste out of a word processor
 * arrives as `color:#FF0000;font-family:Arial`, and refusing the whole
 * attribute over the second half would throw away the colour the author
 * actually chose. So declarations are read one at a time and only `color`
 * survives.
 */
function cleanStyle(raw: string): string | null {
  for (const decl of raw.split(";")) {
    const i = decl.indexOf(":");
    if (i === -1) continue;
    if (decl.slice(0, i).trim().toLowerCase() !== "color") continue;
    const value = decl.slice(i + 1).trim();
    if (!COLOUR_VALUE.test(value)) continue;
    return `color: ${value}`;
  }
  return null;
}

const escapeText = (s: string) =>
  s
    .replace(/&(?![a-zA-Z#0-9]{1,8};)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function cleanAttrs(tag: string, raw: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  const colourable = COLOURABLE.has(tag);
  if (!allowed && !colourable) return "";
  const out: string[] = [];
  const re = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase();
    const value = (m[3] ?? m[4] ?? m[5] ?? "").trim();

    if (colourable && name === "class") {
      // An allowlist, not a filter: a name that is not one of ours is gone,
      // rather than being passed through to collide with a site class.
      const keep = value
        .split(/\s+/)
        .filter((c) => CLASS_ALLOWED.has(c.toLowerCase()));
      if (keep.length) out.push(`class="${keep.join(" ")}"`);
      continue;
    }
    if (colourable && name === "style") {
      const style = cleanStyle(value);
      if (style) out.push(`style="${style}"`);
      continue;
    }

    if (!allowed?.has(name)) continue;
    if (name === "href" && !SAFE_HREF.test(value)) continue;
    out.push(`${name}="${escapeText(value).replace(/"/g, "&quot;")}"`);
  }
  // An external link that opens in a new tab must not hand the opener over.
  if (tag === "a" && out.some((a) => a.startsWith("href=\"http"))) {
    out.push('target="_blank"', 'rel="noopener noreferrer"');
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

export function sanitizeHtml(input: string): string {
  if (!input) return "";

  // Drop dangerous elements whole, contents included, before anything else.
  let html = input;
  for (const tag of STRIP_CONTENT) {
    html = html.replace(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"),
      "",
    );
    html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }
  // Comments can hide markup from a naive reader; they carry nothing we want.
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  const out: string[] = [];
  const open: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html))) {
    out.push(escapeText(html.slice(last, m.index)));
    last = m.index + m[0].length;

    const tag = m[1].toLowerCase();
    const closing = m[0].startsWith("</");
    const selfClosing = tag === "br" || tag === "hr" || m[2].trim().endsWith("/");

    if (!ALLOWED.has(tag)) continue; // unwrap: the text around it survives

    if (closing) {
      const i = open.lastIndexOf(tag);
      if (i === -1) continue; // a stray close tag closes nothing
      // Close anything left hanging inside it, so the output stays balanced.
      while (open.length > i) out.push(`</${open.pop()}>`);
      continue;
    }

    if (selfClosing) {
      out.push(`<${tag}${cleanAttrs(tag, m[2])}>`);
      continue;
    }
    out.push(`<${tag}${cleanAttrs(tag, m[2])}>`);
    open.push(tag);
  }

  out.push(escapeText(html.slice(last)));
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join("");
}

/**
 * The explainer as it is actually authored: HTML for emphasis, newlines for
 * structure.
 *
 * The live copy carries fifty-one newlines and not one `<p>` or `<br>`, which
 * is how the old editor worked — you pressed Enter and it turned the break
 * into markup on the way out. Without that step the whole page collapses into
 * a single run of text with the bullet list flowing inline, so the conversion
 * is part of rendering rather than something the author should have to think
 * about.
 *
 * Runs before the sanitiser, not after: `<br>` is on the allowlist, so the
 * breaks are checked like any other markup rather than injected past it.
 */
export function renderRichText(src: string): string {
  if (!src) return "";
  return sanitizeHtml(src.replace(/\r\n?/g, "\n").replace(/\n/g, "<br>"));
}
