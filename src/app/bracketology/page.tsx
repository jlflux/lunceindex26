import Link from "next/link";
import AppShell, { PageHeader } from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import BracketBoard, { type BoardClass } from "@/components/bracket/BracketBoard";
import { regionKey, resolveBracket, seededRegions } from "@/lib/bracket";
import { loadBracket, loadRatings } from "@/lib/data";
import { CLS_FILTER_ORDER } from "@/lib/types";

export const revalidate = 300;
export const metadata = { title: "Bracketology" };

/**
 * The bracket, resolved on the server.
 *
 * Everything here is derived from two documents — the published ratings
 * snapshot and the hand-authored bracket layer — and the join between them is
 * a seed rather than a team, so the page has no state of its own to keep in
 * sync. Both projected and as-played brackets are resolved here rather than in
 * the browser, because the rules about when a projection may be shown belong
 * with the resolver.
 */
export default async function BracketologyPage() {
  const [data, state] = await Promise.all([loadRatings(), loadBracket()]);

  const seeded = seededRegions(data.ratings, data.games, data.odds, state);

  const classes: BoardClass[] = [];
  for (const cls of CLS_FILTER_ORDER) {
    const field = data.ratings.filter((t) => t.classification === cls);
    if (!field.length) continue;
    const regionCount = Math.max(...field.map((t) => t.region));

    const regions = [];
    for (let r = 1; r <= regionCount; r++) {
      const teams = seeded.get(regionKey(cls, r)) ?? [];
      if (!teams.length) continue;
      regions.push({
        region: r,
        teams,
        note: state.classes[cls]?.regions?.[String(r)]?.note || undefined,
      });
    }

    classes.push({
      classification: cls,
      bracket: resolveBracket(state, cls, seeded, data.games),
      bracketProjected: resolveBracket(state, cls, seeded, data.games, {
        projected: true,
      }),
      regions,
    });
  }

  const anyBracket = classes.some((c) => c.bracket);

  return (
    <AppShell generated={data.generated}>
      <PageHeader
        title="Bracketology"
        subtitle={
          <>
            Where the playoff field stands if the season ended today, and where
            it looks to be heading. Seeds come from the region standings, which
            are the association&rsquo;s own order; the bracket itself is laid
            out by hand.
          </>
        }
      />

      {state.aboutBanner.enabled && state.aboutBanner.text && (
        <Link
          href="/bracketology/about"
          className="card mb-4 flex items-center gap-3 px-4 py-3 transition-colors hover:border-[rgb(var(--brand))]"
          style={{ borderColor: "rgb(var(--brand) / 0.45)" }}
        >
          <span
            className="text-[13.5px] font-semibold"
            style={{ color: "rgb(var(--brand))" }}
          >
            {state.aboutBanner.text}
          </span>
          <span
            className="ml-auto shrink-0 text-[12px] font-bold"
            style={{ color: "rgb(var(--brand))" }}
          >
            Learn more &rarr;
          </span>
        </Link>
      )}

      {state.newsNote && (
        <div
          className="card mb-4 px-4 py-3"
          style={{ borderColor: "rgb(var(--brand) / 0.35)" }}
        >
          <div
            className="mb-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "rgb(var(--brand))" }}
          >
            Notes &amp; tiebreakers
          </div>
          <p
            className="whitespace-pre-wrap text-[13.5px] leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            {state.newsNote}
          </p>
        </div>
      )}

      {anyBracket ? (
        <BracketBoard
          classes={classes}
          showProjections={state.showProjections}
        />
      ) : (
        <EmptyState
          icon="trophy"
          title="No bracket yet"
          body="Nothing has been laid out. Load supabase/bracket_seed.sql to bring the old site's brackets across, or start one from the standard shape under Admin → Bracketology → Bracket."
        />
      )}
    </AppShell>
  );
}
