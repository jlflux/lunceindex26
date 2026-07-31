import AppShell, { PageHeader } from "@/components/AppShell";
import RatingsTable from "@/components/RatingsTable";
import EmptyState from "@/components/EmptyState";
import { loadRatings } from "@/lib/data";

export const revalidate = 300;
export const metadata = { title: "RPI" };

export default async function RpiPage() {
  const data = await loadRatings();

  return (
    <AppShell generated={data.rpi.length ? data.generated : undefined}>
      <PageHeader
        title="RPI Rankings"
        subtitle="25% win percentage + 50% opponents' win percentage + 25% opponents' opponents' win percentage. Out-of-state opponents count toward a team's record but are excluded from opponent-strength terms."
      />

      {data.rpi.length === 0 ? (
        <EmptyState
          title="No RPI published yet"
          body="RPI needs played games. Enter results and publish from the admin dashboard."
        />
      ) : (
        <RatingsTable mode="rpi" ratings={data.ratings} rpi={data.rpi} />
      )}
    </AppShell>
  );
}
