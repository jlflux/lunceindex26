import AppShell, { PageHeader } from "@/components/AppShell";
import RatingsTable from "@/components/RatingsTable";
import EmptyState from "@/components/EmptyState";
import type { FormulaSpec } from "@/lib/formula-boards";
import { isPlayed } from "@/lib/result";
import type { RatingsPayload } from "@/lib/types";

/**
 * The page every reproduced formula gets.
 *
 * The boards differ in their weights and in what they say about themselves,
 * and in nothing else — so the shell is written once. A second one that
 * drifted from the first would be saying the two formulas work differently
 * when all that differs is three numbers.
 */
export default function FormulaBoardPage({
  data,
  spec,
  title,
  subtitle,
  note,
}: {
  data: RatingsPayload;
  spec: FormulaSpec;
  title: string;
  subtitle: React.ReactNode;
  /** The small print under the table: what the published formula leaves open. */
  note: React.ReactNode;
}) {
  const hasGames = data.games.some((g) => isPlayed(g) || Boolean(g.forfeit_by));

  return (
    <AppShell generated={hasGames ? data.generated : undefined}>
      <PageHeader title={title} subtitle={subtitle} />

      {!hasGames ? (
        <EmptyState
          title={`No ${spec.label} published yet`}
          body={`${spec.label} is built from win-loss records, so it needs played games. Enter results and publish from the admin dashboard.`}
        />
      ) : (
        <>
          <RatingsTable
            mode={spec.key as "psr" | "schsl"}
            payload={data}
          />
          <p
            className="mt-4 max-w-[68ch] text-[12px] leading-relaxed"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            {note}
          </p>
        </>
      )}
    </AppShell>
  );
}
