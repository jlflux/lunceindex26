import AppShell, { PageHeader } from "@/components/AppShell";
import RatingsTable from "@/components/RatingsTable";
import EmptyState from "@/components/EmptyState";
import { loadRatings } from "@/lib/data";
import { guardSection } from "@/lib/guard";
import { PSR_WEIGHTS, WIN_VALUE } from "@/lib/psr";
import { isPlayed } from "@/lib/result";

export const revalidate = 300;
export const metadata = { title: "PSR" };

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Georgia's seeding formula, run on Alabama's field.
 *
 * Not a second opinion from this site — it is somebody else's published
 * arithmetic, reproduced. That is the point of having it: when it disagrees
 * with the Index, the disagreement is between two stated methods rather than
 * between a number and a mood.
 */
export default async function PsrPage() {
  await guardSection("/psr");

  const data = await loadRatings();
  const hasGames = data.games.some(
    (g) => isPlayed(g) || Boolean(g.forfeit_by),
  );

  return (
    <AppShell generated={hasGames ? data.generated : undefined}>
      <PageHeader
        title="PSR Rankings"
        subtitle={
          <>
            Post Season Ranking — the formula the GHSA seeds its Georgia
            brackets with, run on the AHSAA field.{" "}
            {pct(PSR_WEIGHTS.wp)} win percentage + {pct(PSR_WEIGHTS.owp)}{" "}
            opponents&rsquo; win percentage + {pct(PSR_WEIGHTS.oowp)}{" "}
            opponents&rsquo; opponents&rsquo; win percentage. A win counts one
            wherever it was won — home, away or neutral — except over a school
            outside the association, which counts {WIN_VALUE.nonMember}. Those
            games stay in your record and out of the strength terms, because no
            record is held for the school on the other side.
          </>
        }
      />

      {!hasGames ? (
        <EmptyState
          title="No PSR published yet"
          body="PSR is built from win-loss records, so it needs played games. Enter results and publish from the admin dashboard."
        />
      ) : (
        <>
          <RatingsTable mode="psr" payload={data} />
          <p
            className="mt-4 max-w-[68ch] text-[12px] leading-relaxed"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            Two details the published formula leaves open, settled here the way
            the RPI board next door settles them: an opponent&rsquo;s win
            percentage is their whole record, with the game against you left in
            rather than taken out, and a tie counts half a win to both sides.
            Nothing on this page feeds the Index, the bracket or the playoff
            odds.
          </p>
        </>
      )}
    </AppShell>
  );
}
