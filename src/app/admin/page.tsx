import Link from "next/link";
import AdminError from "@/components/admin/AdminError";
import { AdminHeader } from "@/components/admin/AdminShell";
import PublishButton from "@/components/admin/PublishButton";
import Icon from "@/components/Icon";
import StatCard from "@/components/StatCard";
import { loadConfig, loadGames, loadTeams } from "@/lib/data";
import { isPlayed } from "@/lib/engine";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  let teams, games, config;
  try {
    [teams, games, config] = await Promise.all([
      loadTeams(true),
      loadGames(true),
      loadConfig(true),
    ]);
  } catch (e) {
    return <AdminError error={e instanceof Error ? e.message : String(e)} />;
  }

  const played = games.filter(isPlayed);
  const maxWeek = played.reduce((m, g) => Math.max(m, g.week ?? 0), 0);
  const priorBlend = Math.max(0, 1 - maxWeek / 4);
  const withPriors = teams.filter((t) => t.preseason_prior !== null).length;

  return (
    <div className="space-y-7">
      <AdminHeader
        title="Dashboard"
        subtitle="Edits save immediately but stay off the public site until you publish."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon="users" label="Teams" value={teams.length.toLocaleString()} />
        <StatCard
          icon="calendar"
          label="Games on file"
          value={games.length.toLocaleString()}
        />
        <StatCard
          icon="check"
          label="Games played"
          value={played.length.toLocaleString()}
        />
        <StatCard
          icon="clock"
          label="Latest week"
          value={played.length ? `Week ${maxWeek}` : "—"}
        />
        <StatCard
          icon="database"
          label="Carry-over"
          value={`${Math.round(priorBlend * 100)}%`}
        />
      </div>

      {withPriors < teams.length && (
        <div
          className="card p-4"
          style={{ borderColor: "rgb(var(--warn) / 0.45)" }}
        >
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <span style={{ color: "rgb(var(--warn))" }}>
              <Icon name="info" size={15} />
            </span>
            {teams.length - withPriors} of {teams.length} teams have no preseason
            rating
          </h2>
          <p
            className="mt-1.5 text-sm leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            Those teams seed from their classification baseline alone. Import
            carry-over ratings on the{" "}
            <Link href="/admin/teams" className="font-semibold underline">
              Teams
            </Link>{" "}
            page to start the season where last season finished.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-[13px] font-bold uppercase tracking-wider">
          Publish
        </h2>
        <PublishButton />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-bold uppercase tracking-wider">
            Current formula
          </h2>
          <Link href="/admin/formula" className="btn !py-1.5 !text-xs">
            <Icon name="sliders" size={14} />
            Adjust
          </Link>
        </div>
        <div className="card table-scroll scroll-thin overflow-hidden">
          <table className="w-full">
            <tbody>
              {Object.entries(config).map(([k, v]) => (
                <tr
                  key={k}
                  className="border-b last:border-0"
                  style={{ borderColor: "rgb(var(--border))" }}
                >
                  <td
                    className="td font-medium"
                    style={{ color: "rgb(var(--text-muted))" }}
                  >
                    {k}
                  </td>
                  <td className="td !text-right font-bold tnum">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
