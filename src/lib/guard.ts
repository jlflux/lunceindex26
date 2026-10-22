import "server-only";
import { notFound } from "next/navigation";
import { loadHome } from "./data";
import { isPathHidden } from "./site-sections";

/**
 * Refuses to serve a section that has been switched off.
 *
 * Every page of a hideable section calls this first. Doing it per page rather
 * than in middleware is deliberate: the guard needs the stored document, and
 * the middleware runs on the edge in front of every request including the
 * assets — it would put a database read in the path of all of them to gate a
 * handful.
 *
 * `notFound()` rather than a notice, because the person hiding a board is
 * usually hiding it from everyone, and a page that explains itself invites
 * the reader to come back and check whether the numbers have been fixed yet.
 */
export async function guardSection(path: string): Promise<void> {
  const home = await loadHome();
  if (isPathHidden(path, home.hiddenSections)) notFound();
}

/** The hidden list, for chrome that has to leave links out. */
export async function hiddenSections(): Promise<string[]> {
  return (await loadHome()).hiddenSections;
}
