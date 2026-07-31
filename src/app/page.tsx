import AppShell, { PageHeader } from "@/components/AppShell";
import RatingsTable from "@/components/RatingsTable";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import { loadRatings } from "@/lib/data";
import { isPlayed } from "@/lib/engine";
import type { Classification } from "@/lib/types";
import { CLS_ORDER } from "@/lib/types";

export const revalidate = 300;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const { class: classParam } = await searchParams;
  const initialClass =
    classParam && classParam in CLS_ORDER
      ? (classParam as Classification)
      : "all";

  const data = await loadRatings();
  const played = data.games.filter(isPlayed);

  return (
    <AppShell
      breadcrumb={[{ label: "Rankings" }, { label: "Power Index" }]}
      meta={
        data.ratings.length
          ? `Updated ${new Date(data.generated).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}`
          : undefined
      }
    >
      <PageHeader
        title="AHSAA Power Ratings"
        subtitle="A composite rating blending a Massey-style solve with strength of schedule, scoring efficiency and win quality. Select any team for its full breakdown, schedule and projections."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon="users"
          label="Teams rated"
          value={data.ratings.length.toLocaleString()}
          note="across 8 classifications"
        />
        <StatCard
          icon="calendar"
          label="Games played"
          value={played.length.toLocaleString()}
          note={`of ${data.games.length.toLocaleString()} scheduled`}
        />
        <StatCard
          icon="clock"
          label="Through"
          value={
            played.length === 0 ? "Preseason" : `Week ${data.max_week_played}`
          }
          note={played.length === 0 ? "season not started" : "latest result"}
        />
        <StatCard
          icon="database"
          label="Preseason carry-over"
          value={`${Math.round(data.prior_blend * 100)}%`}
          note="weight on last season"
        />
      </div>

      {data.ratings.length === 0 ? (
        <EmptyState
          title="No ratings published yet"
          body="Seed the teams, then publish from the admin dashboard to generate the first board."
        />
      ) : (
        <RatingsTable
          mode="index"
          ratings={data.ratings}
          rpi={data.rpi}
          initialClass={initialClass}
        />
      )}
    </AppShell>
  );
}
