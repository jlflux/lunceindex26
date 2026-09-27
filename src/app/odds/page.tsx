import AppShell, { PageHeader, UpdatedStamp } from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import OddsBoard from "@/components/OddsBoard";
import { loadRatings } from "@/lib/data";
import { formatUpdated } from "@/lib/rankings";

export const revalidate = 300;
export const metadata = { title: "Playoff Odds" };

export default async function OddsPage() {
  const data = await loadRatings();
  const odds = data.odds;

  return (
    <AppShell generated={data.generated}>
      <PageHeader
        title="Playoff Odds"
        subtitle={
          <>
            The rest of the season, played ten thousand times. Every game still
            to come is decided by a coin weighted by the two teams&rsquo;
            ratings, the region tables are rebuilt, and the brackets are seeded
            and played out. A team&rsquo;s odds are the share of those seasons
            in which it happened.
          </>
        }
        meta={
          odds ? (
            <UpdatedStamp label="Simulated" when={formatUpdated(odds.generated)} />
          ) : undefined
        }
      />

      {!odds || !odds.classes.length ? (
        <EmptyState
          title="No odds yet"
          body="Odds are simulated when the board is published. Run Recompute & publish from the admin dashboard."
        />
      ) : (
        <div className="space-y-5">
          <OddsBoard report={odds} />

          <section
            className="card p-4 text-xs leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            <h2
              className="mb-2 text-[11px] font-bold uppercase tracking-[0.09em]"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              How these are worked out
            </h2>
            <p>
              {odds.remaining > 0 ? (
                <>
                  There are <strong>{odds.remaining}</strong> region games left
                  to play. Each one is simulated from the two teams&rsquo; Index
                  ratings and home field, the region tables are rebuilt from the
                  result, and the top{" "}
                  {odds.classes[0]?.qualifiers ?? 4} in each region are seeded
                  into the bracket.
                </>
              ) : (
                <>
                  Every region game has been played, so the tables and the seeds
                  are settled. What remains is the bracket itself, simulated
                  from the ratings.
                </>
              )}{" "}
              Teams level in a region are separated by the
              association&rsquo;s own procedure, (a) through (q): head-to-head
              first, then records against each ranked team in the region, then
              non-region common opponents, then how much the teams they beat
              have won. It settles one place at a time and starts over for
              whoever is left, which is what the rule says to do. The last
              step is a coin flip, and since there is no coin here the Index
              rating stands in for it. The standings page runs the same
              procedure, so the two cannot disagree about who holds a playoff
              place.
            </p>
            <p className="mt-2">
              The one number behind all of it is how often a rating gap turns
              into a win. That is not guessed — it is fitted against the 2025
              season by rating the weeks before each week and predicting that
              week cold, which picks about four winners in five and whose
              stated probabilities land within two points of what actually
              happened at every level of confidence.
            </p>
            <p className="mt-2">
              A figure reads <strong>&gt;99%</strong> rather than 100% when
              every simulated season agreed but the arithmetic has not closed
              the door — a team can win ten thousand out of ten thousand and
              still, in principle, play its way out. Only a place that cannot
              be lost is printed flat.
            </p>
            <p className="mt-2">
              Odds move only when results do. They are recomputed when the board
              is published, not on a timer.
            </p>
          </section>
        </div>
      )}
    </AppShell>
  );
}
