import AppShell, { PageHeader } from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import TeamDirectory from "@/components/TeamDirectory";
import { loadRatings } from "@/lib/data";

export const revalidate = 300;
export const metadata = { title: "All Teams" };

export default async function TeamsPage() {
  const data = await loadRatings();

  return (
    <AppShell generated={data.generated}>
      <PageHeader
        title="All Teams"
        subtitle="Every AHSAA football program, grouped by classification and region."
      />
      {data.ratings.length === 0 ? (
        <EmptyState
          title="No teams yet"
          body="Seed the roster and publish from the admin dashboard."
          icon="users"
        />
      ) : (
        <TeamDirectory rows={data.ratings} />
      )}
    </AppShell>
  );
}
