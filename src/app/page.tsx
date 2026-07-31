import RatingsExplorer from "@/components/RatingsExplorer";
import SiteHeader from "@/components/SiteHeader";
import { loadRatings } from "@/lib/data";

// Ratings only change when an admin publishes, so serve them cached and
// revalidate periodically rather than solving per request.
export const revalidate = 300;

export default async function HomePage() {
  const data = await loadRatings();
  const played = data.games.filter((g) => g.s1 !== null && g.s2 !== null).length;

  return (
    <>
      <SiteHeader generated={data.generated} />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 space-y-3">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            AHSAA Football Power Ratings
          </h1>
          <p
            className="max-w-2xl text-sm leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            A composite rating blending a Massey-style solve with strength of
            schedule, scoring efficiency and win quality. Tap any team for its
            full profile, schedule and projections.
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <Stat label="Teams" value={data.ratings.length.toLocaleString()} />
            <Stat label="Games played" value={played.toLocaleString()} />
            <Stat
              label="Through"
              value={
                played === 0
                  ? "Preseason"
                  : data.max_week_played === 0
                    ? "Week 0"
                    : `Week ${data.max_week_played}`
              }
            />
            <Stat
              label="Preseason carry-over"
              value={`${Math.round(data.prior_blend * 100)}%`}
            />
          </div>
        </div>

        {data.ratings.length === 0 ? (
          <div className="card px-4 py-16 text-center">
            <p className="text-sm font-semibold">No ratings published yet.</p>
            <p
              className="mx-auto mt-2 max-w-md text-sm leading-relaxed"
              style={{ color: "rgb(var(--text-muted))" }}
            >
              Seed the teams, then publish from the admin dashboard to generate
              the first board.
            </p>
          </div>
        ) : (
          <RatingsExplorer ratings={data.ratings} rpi={data.rpi} />
        )}

        <footer
          className="mt-10 border-t pt-6 text-xs leading-relaxed"
          style={{
            borderColor: "rgb(var(--border))",
            color: "rgb(var(--text-faint))",
          }}
        >
          <p>
            RPI = 25% win percentage + 50% opponents&rsquo; win percentage + 25%
            opponents&rsquo; opponents&rsquo; win percentage. Out-of-state
            opponents count toward a team&rsquo;s record but are excluded from
            opponent-strength calculations.
          </p>
        </footer>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-2">
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "rgb(var(--text-faint))" }}
      >
        {label}
      </div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}
