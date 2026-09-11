import AppShell, { PageHeader } from "@/components/AppShell";
import RatingsTable from "@/components/RatingsTable";
import EmptyState from "@/components/EmptyState";
import { loadRatings } from "@/lib/data";

export const revalidate = 300;
export const metadata = { title: "Résumé Rankings" };

export default async function ResumePage() {
  const data = await loadRatings();
  const hasResume = data.ratings.some(
    (r) => typeof r.sor === "number" && r.wins + r.losses > 0,
  );

  return (
    <AppShell generated={hasResume ? data.generated : undefined}>
      <PageHeader
        title="Résumé Rankings"
        subtitle="What each team has earned, rather than how good it is. Your wins, minus the wins a top-ten team would be expected to take from your exact schedule. Margin is ignored entirely — beating a good team counts however narrowly, and losing to a weak one costs however narrowly."
      />

      {!hasResume ? (
        <EmptyState
          title="No résumé rankings yet"
          body="The résumé board needs played games, and the Index must be running the two-way engine. Enter results and publish from the admin dashboard."
        />
      ) : (
        <RatingsTable mode="resume" payload={data} />
      )}
    </AppShell>
  );
}
