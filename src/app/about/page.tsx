import AppShell, { PageHeader } from "@/components/AppShell";
import { loadRatings } from "@/lib/data";

export const revalidate = 300;
export const metadata = { title: "How ratings work" };

export default async function AboutPage() {
  const { config } = await loadRatings();

  return (
    <AppShell>
      <PageHeader
        title="How the ratings work"
        subtitle="What goes into a team's number, and why it is built the way it is."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Panel title="The short version">
            <p>
              Every team gets a single composite rating. It starts from a
              Massey-style solve — an iterative pass over every played game that
              rates you by your margin against the quality of who you played —
              and then adjusts for strength of schedule, scoring efficiency and
              win quality.
            </p>
            <p>
              Ratings only move when games are played. A full season schedule
              can sit on the site from day one without affecting anything,
              because a game is only counted once both scores exist.
            </p>
          </Panel>

          <Panel title="Why not a pure Massey rating">
            <p>
              A plain Massey or SRS rating is <em>predictive</em>: it optimises
              margin against schedule and does not care whether you actually
              won. Tested against FBS 2025, plain SRS put a team that missed the
              playoff above a team that won a playoff game, purely because it
              ran up bigger margins on a weaker slate.
            </p>
            <p>
              So win quality is its own term, and schedule strength is weighted
              to dominate raw record.
            </p>
          </Panel>

          <Panel title="Why classification matters">
            <p>
              Every team is pulled toward a baseline set by its classification,
              and that pull is re-applied on every pass of the solve rather than
              just used as a starting point. Without it, an undefeated Class 1A
              team beating its own classification by 40 a week outranks a 6A
              playoff team — which is the failure the whole design exists to
              avoid.
            </p>
            <p>
              Early in the season each team also carries part of its rating over
              from last year, regressed toward its new classification&rsquo;s
              average to account for roster turnover. That carry-over decays to
              nothing by week four.
            </p>
          </Panel>

          <Panel title="Strength of schedule and efficiency">
            <p>
              Strength of schedule is the mean rating of every opponent you have
              faced. Offensive efficiency measures how much better you scored
              than your opponents typically allow; defensive efficiency, how
              much better you defended than they typically score.
            </p>
            <p>
              Efficiency credit is damped by schedule quality — you do not get
              full marks for outscoring weak opponents.
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
              labelled against that projection — dominant, exceeded, as
              expected, or below expectation. Projections never feed back into
              the ratings.
            </p>
          </Panel>
        </div>

        <aside>
          <h2 className="mb-2.5 text-[13px] font-bold uppercase tracking-wider">
            Current settings
          </h2>
          <div className="card divide-y" style={{ borderColor: "rgb(var(--border))" }}>
            <Setting label="Schedule strength weight" value={config.sos_w} />
            <Setting label="Efficiency weight" value={config.eff_w} />
            <Setting label="Win-rate bonus" value={config.wr_w} />
            <Setting label="Classification pull" value={config.prior_w} />
            <Setting label="Margin cap" value={`${config.cap} pts`} />
            <Setting label="Home-field advantage" value={`${config.hfa} pts`} />
            <Setting
              label="Championship multiplier"
              value={`${config.playoff_r5}×`}
            />
          </div>
          <p
            className="mt-3 text-xs leading-relaxed"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            The margin cap stops blowouts being farmed — winning by 50 counts
            the same as winning by {config.cap}. Playoff margins are weighted
            more heavily round by round.
          </p>
        </aside>
      </div>
    </AppShell>
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
        className="space-y-2.5 text-sm leading-relaxed"
        style={{ color: "rgb(var(--text-muted))" }}
      >
        {children}
      </div>
    </section>
  );
}

function Setting({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-[13px]" style={{ color: "rgb(var(--text-muted))" }}>
        {label}
      </span>
      <span className="text-[13px] font-bold tnum">{value}</span>
    </div>
  );
}
