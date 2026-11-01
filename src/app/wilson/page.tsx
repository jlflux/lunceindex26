import AppShell, { PageHeader } from "@/components/AppShell";
import RatingsTable from "@/components/RatingsTable";
import EmptyState from "@/components/EmptyState";
import { loadRatings } from "@/lib/data";
import { guardSection } from "@/lib/guard";
import { isPlayed } from "@/lib/result";

export const revalidate = 300;
export const metadata = { title: "Wilson" };

/**
 * David Wilson's rating, run on our field.
 *
 * The third of the reproduced boards and the odd one out: PSR and the SCHSL
 * RPI are formulas, evaluated once. This one is a circular definition that
 * has to be solved, and it is the only board here whose answer depends on
 * every game in the state at once.
 */
export default async function WilsonPage() {
  await guardSection("/wilson");

  const data = await loadRatings();
  const hasGames = data.games.some((g) => isPlayed(g) || Boolean(g.forfeit_by));

  return (
    <AppShell generated={hasGames ? data.generated : undefined}>
      <PageHeader
        title="Wilson Ratings"
        subtitle={
          <>
            David Wilson rated college football with this from 1994 to 2000,
            and the method is one sentence: a team&rsquo;s rating is the
            average of its game ratings, and a game rating is the
            opponent&rsquo;s rating plus 100 for a win or minus 100 for a loss.
            Scores are not in it. Neither is home or away. Since every
            opponent&rsquo;s rating is itself the average of their games, the
            definition chases its own tail — so it is solved rather than
            calculated, every team at once, until the whole state stops
            moving.
          </>
        }
      />

      {!hasGames ? (
        <EmptyState
          title="No Wilson ratings yet"
          body="The rating is built from results, so it needs played games. Enter results and publish from the admin dashboard."
        />
      ) : (
        <>
          <RatingsTable mode="wilson" payload={data} />
          <p
            className="mt-4 max-w-[68ch] text-[12px] leading-relaxed"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            500 is the average Alabama team and 100 points is one win.{" "}
            <strong>Opp</strong> is the average rating of everyone a team has
            played, which is what the rating is built on. One thing in his code
            is not in the sentence above and changes a lot: a result that
            argues against a team counts a twentieth of a game, so beating a
            weak team barely costs you and losing to a strong one barely helps.
            Out-of-state opponents are rated alongside everyone else, because
            they played these teams, but they are not listed and they do not
            move the average. Ported from the C David Wilson published, by way
            of{" "}
            <a
              href="https://github.com/codykirkpatrick/wilson"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Cody Kirkpatrick&rsquo;s archive of it
            </a>
            , and checked against that code&rsquo;s own published ratings — all
            764 of them, to the point. Nothing here feeds the Index, the
            bracket or the playoff odds.
          </p>
        </>
      )}
    </AppShell>
  );
}
