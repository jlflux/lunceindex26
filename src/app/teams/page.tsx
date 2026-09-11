import AppShell, { PageHeader } from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import TeamDirectory from "@/components/TeamDirectory";
import { loadRatings } from "@/lib/data";

export const revalidate = 300;
export const metadata = { title: "Standings" };

export default async function TeamsPage() {
  const data = await loadRatings();

  return (
    <AppShell generated={data.generated}>
      <PageHeader
        title="Standings"
        subtitle="Every AHSAA football program, grouped by classification and region. Records read overall first, then region — and region order is what decides the playoffs."
      />
      {data.ratings.length === 0 ? (
        <EmptyState
          title="No teams yet"
          body="Seed the roster and publish from the admin dashboard."
          icon="users"
        />
      ) : (
        <TeamDirectory rows={data.ratings} games={data.games} />
      )}
    </AppShell>
  );
}
