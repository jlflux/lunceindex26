import AppShell, { PageHeader } from "@/components/AppShell";

export const metadata = { title: "How the ALPreps Index works" };

/**
 * Plain copy, no data. It used to render a panel of live config values, which
 * meant the page had to fetch ratings and re-render on a schedule; it now says
 * nothing that changes when a slider moves, so it is fully static.
 */
export default function AboutPage() {
  return (
    <AppShell>
      <PageHeader title="How the ALPreps Index Works" />

      {/* Full width, in two columns — a single 1280px line of body copy is
          unreadable however much room there is to set it in. */}
      <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
        <section className="card p-5">
          <div
            className="space-y-3.5 text-[15px] leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            <p>
              Every team starts with a rating. Win, and it goes up. Lose, and it
              goes down. That&rsquo;s the simple explanation.
            </p>
            <p>
              But not all wins are equal. Beating a strong team moves your
              rating a lot more than beating a weak one. That&rsquo;s true for
              your opponents too. Your rating depends on who you played, whose
              ratings depend on who they played, and so on across the state. The
              system runs that loop hundreds of times until every rating settles
              into place.
            </p>

            <p style={{ color: "rgb(var(--text))" }}>
              A few things it accounts for:
            </p>
            <ul className="space-y-2 pl-1">
              <Point>Margin of victory does matter &mdash; to a point.</Point>
              <Point>
                Your schedule matters a lot. A 7-3 team that played everybody
                tough could possibly rate higher than a 10-0 team that
                didn&rsquo;t.
              </Point>
              <Point>
                Classification matters a little. A 1A powerhouse and a 6A
                powerhouse aren&rsquo;t the same thing, and the ratings reflect
                that.
              </Point>
              <Point>
                When the playoffs start, those wins will count for a little
                extra.
              </Point>
            </ul>

            <p>
              Preseason, teams start where last season left them. We ran this
              formula starting with the full 2025 season, then adjusted for the
              new classifications. That head start fades as the weeks roll on
              and games are played, and it&rsquo;s gone entirely by midseason.
            </p>
            <p>
              One last note &mdash; these ratings are for fun and don&rsquo;t
              mean anything when it comes to region standings or the playoff
              picture. Everything here is math with no opinion or eye test
              involved. We hope every team that is listed as an underdog here
              proves the model wrong!
            </p>
            <p style={{ color: "rgb(var(--text))" }}>
              If you see any errors or anything that stands out, please let us
              know!
            </p>
          </div>
        </section>

        <div className="space-y-5">
          <Panel title="Résumé Rankings">
            <p>
              The Power Index answers &ldquo;how good is this team?&rdquo; The
              Résumé board answers a different question &mdash; &ldquo;what has
              this team actually earned?&rdquo; It takes your wins and subtracts
              the wins a top-ten team would be expected to take from your exact
              schedule. A positive number means you have done better than an
              elite team would have with your slate.
            </p>
            <p>
              Margin is ignored completely. Beating a good team counts the same
              whether it was by one point or thirty, and losing to a weak one
              costs the same either way. That is deliberate: it is the half of
              the picture the Power Index cannot give you, and the two boards
              disagreeing about a team is usually the interesting part rather
              than a mistake.
            </p>
          </Panel>

          <Panel title="Adjusted offence and defence">
            <p>
              Adj O is what a team would score against an average AHSAA defence;
              Adj D is what it would allow to an average AHSAA offence. The
              rating is the difference between them. Both are corrected for the
              quality of the units actually faced, so holding a good offence to
              14 counts for more than holding a poor one to 7.
            </p>
            <p>
              Both are capped. A model that works in ratios has no upper limit
              and football does &mdash; 48 minutes, starters pulled once a game
              is gone &mdash; so left alone the arithmetic claimed 94 points a
              game for the best offence in the state. Checked against every
              game of last season, teams the model expected to score 70 actually
              scored 56. The cap is set where those predictions come back into
              line.
            </p>
            <p>
              They stay blank until a team has played three games. Until then
              the split between offence and defence leans mostly on last
              season&rsquo;s carry-over rather than on this season&rsquo;s
              results, and a number that follows the rating instead of the
              scoreboard is worse than no number. The rating and the record are
              never hidden.
            </p>
          </Panel>

          <Panel title="RPI">
            <p>
              RPI is a separate, simpler measure kept alongside the index: 25%
              your win percentage, 50% your opponents&rsquo; win percentage, and
              25% your opponents&rsquo; opponents&rsquo; win percentage.
            </p>
            <p>
              Out-of-state opponents count toward your own record but are
              excluded from the opponent-strength terms, since there is no
              in-system record for them.
            </p>
          </Panel>

          <Panel title="Projections">
            <p>
              Each scheduled game shows a projected margin from the rating gap
              plus home-field advantage. Once a result is entered, it is
              labelled against that projection &mdash; dominant, exceeded, as
              expected, or below expectation. Projections never feed back into
              the ratings.
            </p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

/** Bulleted point with a class-coloured marker rather than a browser bullet. */
function Point({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden
        className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: "rgb(var(--brand))" }}
      />
      <span>{children}</span>
    </li>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h2 className="mb-2 text-base font-bold tracking-tight">{title}</h2>
      <div
        className="space-y-2.5 text-[15px] leading-relaxed"
        style={{ color: "rgb(var(--text-muted))" }}
      >
        {children}
      </div>
    </section>
  );
}
