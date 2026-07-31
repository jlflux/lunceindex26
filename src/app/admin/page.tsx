import Link from "next/link";
import PublishButton from "@/components/admin/PublishButton";
import { loadConfig, loadGames, loadTeams } from "@/lib/data";
import { isPlayed } from "@/lib/engine";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [teams, games, config] = await Promise.all([
    loadTeams(true),
    loadGames(true),
    loadConfig(true),
  ]);

  const played = games.filter(isPlayed);
  const maxWeek = played.reduce((m, g) => Math.max(m, g.week ?? 0), 0);
  const priorBlend = Math.max(0, 1 - maxWeek / 4);
  const withPriors = teams.filter((t) => t.preseason_prior !== null).length;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-extrabold tracking-tight">Dashboard</h1>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Teams" value={teams.length.toLocaleString()} />
          <Stat label="Games on file" value={games.length.toLocaleString()} />
          <Stat label="Games played" value={played.length.toLocaleString()} />
          <Stat
            label="Latest week played"
            value={played.length ? `Week ${maxWeek}` : "—"}
          />
          <Stat
            label="Preseason carry-over"
            value={`${Math.round(priorBlend * 100)}%`}
          />
        </div>
      </section>

      {withPriors < teams.length && (
        <section
          className="card p-4"
          style={{ borderColor: "rgb(202 138 4 / 0.5)" }}
        >
          <h2 className="text-sm font-bold">
            {teams.length - withPriors} of {teams.length} teams have no
            preseason rating
          </h2>
          <p
            className="mt-1 text-sm leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            Those teams seed from their classification baseline alone. Import
            carry-over ratings on the{" "}
            <Link href="/admin/teams" className="underline">
              Teams
            </Link>{" "}
            page to start the season where last season finished.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider">Publish</h2>
        <p className="text-sm" style={{ color: "rgb(var(--text-muted))" }}>
          Edits are saved immediately but do not reach the public site until
          you publish. Ratings never move on their own — only played games
          change them.
        </p>
        <PublishButton />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider">
          Current formula
        </h2>
        <div className="card table-scroll">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(config).map(([k, v]) => (
                <tr
                  key={k}
                  className="border-b last:border-0"
                  style={{ borderColor: "rgb(var(--border))" }}
                >
                  <td
                    className="px-3 py-1.5 font-medium"
                    style={{ color: "rgb(var(--text-muted))" }}
                  >
                    {k}
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">
                    {v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link href="/admin/formula" className="btn">
          Adjust formula
        </Link>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-2.5">
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "rgb(var(--text-faint))" }}
      >
        {label}
      </div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
