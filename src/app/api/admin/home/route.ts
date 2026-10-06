import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withAdmin } from "@/lib/admin-auth";
import { loadHome, saveHome } from "@/lib/data";
import { sanitizeHomeState } from "@/lib/home-types";

export const runtime = "nodejs";

export const GET = withAdmin(async () => {
  return NextResponse.json({ ok: true, state: await loadHome(true) });
});

/**
 * Replaces the whole document.
 *
 * A full replace rather than per-field patches, for the same reason the
 * bracket and the Composite work that way: the thing being edited is a shape.
 * Removing a card and hiding one are different edits, and a patch-per-field
 * API cannot say "this is gone".
 *
 * The validation lives in `sanitizeHomeState` so it can be tested without a
 * request. It is re-run here rather than trusted from the client — the editor
 * is the only caller today, but "the only caller is ours" is not a property
 * that survives contact with a second one, and one field, `href`, is written
 * straight into an anchor.
 */
export const PUT = withAdmin(async (req: Request) => {
  const body = (await req.json()) as { state?: unknown };
  const state = sanitizeHomeState(body.state);

  await saveHome(state);

  // The front page reads this document on render, so the edit is live as soon
  // as the cache lets go. Saying so here rather than waiting out `revalidate`
  // is the difference between "it saved" and "it saved and you can see it" —
  // a gap that has already cost an afternoon on the bracket's own toggle.
  revalidatePath("/");

  const links = state.sections.reduce((n, s) => n + s.items.length, 0);
  return NextResponse.json({ ok: true, sections: state.sections.length, links });
});
