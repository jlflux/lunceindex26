import AppShell from "@/components/AppShell";
import RatingsTable from "@/components/RatingsTable";
import EmptyState from "@/components/EmptyState";
import { loadRatings } from "@/lib/data";
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

  return (
    <AppShell generated={data.ratings.length ? data.generated : undefined}>
      {data.ratings.length === 0 ? (
        <EmptyState
          title="No ratings published yet"
          body="Seed the teams, then publish from the admin dashboard to generate the first board."
        />
      ) : (
        <RatingsTable mode="index" payload={data} initialClass={initialClass} />
      )}
    </AppShell>
  );
}
