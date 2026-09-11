import Link from "next/link";
import AppShell, { PageHeader } from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import { loadAswa, loadRatings } from "@/lib/data";
import { buildAswa, othersLine, type AswaClassBlock } from "@/lib/rankings";
import { CLS_FILTER_ORDER } from "@/lib/types";

export const revalidate = 300;
export const metadata = { title: "ASWA Poll" };

export default async function AswaPage() {
  const [data, entries] = await Promise.all([loadRatings(), loadAswa()]);
  const slug = new Map(data.ratings.map((r) => [r.name, r.slug]));
  const blocks = buildAswa(entries, CLS_FILTER_ORDER);

  return (
    <AppShell generated={entries.length ? data.generated : undefined}>
      <PageHeader
        title="ASWA Poll"
        subtitle="The Alabama Sports Writers Association top ten in each classification, voted by a panel of twenty. First-place votes in parentheses, total points on the right. Entered by hand from the weekly release — this is the panel's poll, not ours."
      />

      {!blocks.length ? (
        <EmptyState
          title="No poll entered yet"
          body="Add the week's poll from Admin → ASWA, one classification at a time."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {blocks.map((b) => (
            <ClassBlock key={b.classification} block={b} slug={slug} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function ClassBlock({
  block,
  slug,
}: {
  block: AswaClassBlock;
  slug: Map<string, string>;
}) {
  const others = othersLine(block.others);
  return (
    <section className="card overflow-hidden">
      <div
        className={`border-b px-3 py-2 cls-${block.classification}`}
        style={{
          borderColor: "rgb(var(--border))",
          background: "rgb(var(--surface-2))",
          borderTop: "3px solid rgb(var(--c))",
        }}
      >
        <span className={`chip cls-${block.classification} !px-2 !py-1 !text-xs`}>
          Class {block.classification}
        </span>
      </div>

      <table className="w-full">
        <tbody>
          {block.top.map((e) => (
            <tr
              key={e.team}
              className="border-b last:border-0"
              style={{ borderColor: "rgb(var(--border) / 0.7)" }}
            >
              <td
                className="td !w-8 !px-2 !text-center text-[13px] font-bold tnum"
                style={{ color: "rgb(var(--text-faint))" }}
              >
                {e.rank}
              </td>
              <td className="td !px-1">
                {slug.has(e.team) ? (
                  <Link
                    href={`/team/${slug.get(e.team)}`}
                    className="text-[13.5px] font-semibold hover:underline"
                  >
                    {e.team}
                  </Link>
                ) : (
                  <span className="text-[13.5px] font-semibold">{e.team}</span>
                )}
                {/* The way a poll release prints it: (4) for four first-place
                    votes, omitted entirely when a team has none. */}
                {e.first_votes > 0 && (
                  <span
                    className="ml-1 text-[11px] font-bold"
                    style={{ color: "rgb(var(--brand))" }}
                    title={`${e.first_votes} first-place vote${e.first_votes === 1 ? "" : "s"}`}
                  >
                    ({e.first_votes})
                  </span>
                )}
              </td>
              <td
                className="td !px-1 !text-right text-[12px] tnum"
                style={{ color: "rgb(var(--text-muted))" }}
              >
                {e.wins}-{e.losses}
              </td>
              <td className="td !px-2 !text-right text-[13px] font-bold tnum sm:!pr-3">
                {e.points || ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {others && (
        <div
          className="border-t px-3 py-2 text-[11.5px] leading-relaxed"
          style={{
            borderColor: "rgb(var(--border))",
            color: "rgb(var(--text-muted))",
          }}
        >
          <span
            className="font-bold uppercase tracking-wide"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            Others receiving votes:{" "}
          </span>
          {others}
        </div>
      )}
    </section>
  );
}
