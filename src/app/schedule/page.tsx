import AppShell, { PageHeader } from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import ScheduleBrowser from "@/components/ScheduleBrowser";
import { loadRatings } from "@/lib/data";

export const revalidate = 300;
export const metadata = { title: "Schedule" };

export default async function SchedulePage() {
  const data = await loadRatings();
  const rated = new Map(data.ratings.map((r) => [r.name, r]));

  // Only what the browser needs — the full ratings array would bloat the
  // payload for a page that just lists matchups.
  const games = data.games.map((g) => ({
    t1: g.t1,
    t2: g.t2,
    s1: g.s1,
    s2: g.s2,
    week: g.week,
    type: g.type,
    round: g.round,
    date: g.date,
    t1Slug: rated.get(g.t1)?.slug ?? null,
    t2Slug: rated.get(g.t2)?.slug ?? null,
    t1Class: rated.get(g.t1)?.classification ?? null,
    t2Class: rated.get(g.t2)?.classification ?? null,
    t1Rank: rated.get(g.t1)?.rank ?? null,
    t2Rank: rated.get(g.t2)?.rank ?? null,
  }));

  return (
    <AppShell generated={data.generated}>
      <PageHeader
        title="Schedule"
        subtitle="Every game on file, ordered by the home team’s classification. Results appear as soon as both scores are entered."
      />
      {games.length === 0 ? (
        <EmptyState
          title="No games on file"
          body="Import a weekly schedule PDF from the admin section to populate this."
          icon="calendar"
        />
      ) : (
        <ScheduleBrowser games={games} />
      )}
    </AppShell>
  );
}
