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
              labeled against that projection &mdash; dominant, exceeded, as
              expected, or below expectation. Projections never feed back into
              the ratings.
            </p>
          </Panel>

          <Panel title="Playoff odds">
            <p>
              The odds are the rest of the season played ten thousand times.
              Each game still to come is decided by a coin weighted by the two
              ratings and home field, the region tables are rebuilt, and the
              brackets are seeded and played out. A team&rsquo;s odds are the
              share of those seasons in which the thing happened.
            </p>
            <p>
              The one number behind it is how often a rating gap turns into a
              win. It is fitted against the 2025 season rather than guessed, by
              rating the weeks before each week and predicting that week cold.
              It picks about four winners in five, and what it calls a 70%
              chance happened about 70% of the time.
            </p>
            <p>
              &ldquo;Clinched&rdquo; and &ldquo;eliminated&rdquo; are not read
              off the simulation. Ten thousand seasons without an outcome is not
              a proof, and those two words deserve one, so both come from what
              the remaining games make arithmetically possible.
            </p>
          </Panel>

          <Panel title="Forfeits">
            <p>
              A forfeit is a ruling about the record, not about the football. A
              team that wins on the field and gives the game up afterwards
              &mdash; almost always an eligibility finding weeks later &mdash;
              keeps the scoreline and loses the win.
            </p>
            <p>
              So the two are separated. Records, standings, region order, RPI
              and Résumé all count the forfeit, because those are statements
              about what a team officially holds. The Index does not: it
              measures how well a team plays, and a paperwork ruling does not
              change how a game was played. A record marked with an asterisk
              includes a game decided this way.
            </p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

/** Bulleted point with a class-colored marker rather than a browser bullet. */
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
