import Link from "next/link";
import AppShell, { PageHeader } from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import { loadComposite, loadRatings } from "@/lib/data";
import {
  buildComposite,
  COMPOSITE_RANKED,
  COMPOSITE_SHOWN,
  COMPOSITE_SOURCES,
} from "@/lib/rankings";
import type { Classification } from "@/lib/types";

export const revalidate = 300;
export const metadata = { title: "Composite Rankings" };

export default async function CompositePage() {
  const [data, entries] = await Promise.all([loadRatings(), loadComposite()]);

  const ourRank = new Map(data.ratings.map((r) => [r.name, r.rank]));
  const meta = new Map(
    data.ratings.map((r) => [
      r.name,
      { slug: r.slug, classification: r.classification as Classification },
    ]),
  );
  const record = new Map(
    data.ratings.map((r) => [r.name, `${r.wins}-${r.losses}`]),
  );

  const rows = buildComposite(entries, ourRank, meta).slice(0, COMPOSITE_SHOWN);
  const ranked = rows.filter((r) => r.rank > 0 && r.rank <= COMPOSITE_RANKED);
  const missed = rows.filter((r) => r.rank > COMPOSITE_RANKED);

  return (
    <AppShell generated={entries.length ? data.generated : undefined}>
      <PageHeader
        title="Composite Rankings"
        subtitle="The ALPreps Index averaged with four outside polls. Every number is entered by hand — nothing here is pulled from anyone's site. A team needs a position in all five to be ranked."
      />

      {!ranked.length ? (
        <EmptyState
          title="No composite yet"
          body="Enter the outside poll numbers from Admin → Composite. A team is ranked once it has a position in all five polls."
        />
      ) : (
        <div className="space-y-5">
          <Board rows={ranked} record={record} />
          {missed.length > 0 && (
            <section>
              <h2
                className="mb-2 text-[11px] font-bold uppercase tracking-[0.09em]"
                style={{ color: "rgb(var(--text-faint))" }}
              >
                Just missed the cut
              </h2>
              <Board rows={missed} record={record} muted />
            </section>
          )}
          <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
            Average is the mean of all five positions, lowest first. Ties go to
            the team the Index rates higher.
          </p>
        </div>
      )}
    </AppShell>
  );
}

function Board({
  rows,
  record,
  muted,
}: {
  rows: ReturnType<typeof buildComposite>;
  record: Map<string, string>;
  muted?: boolean;
}) {
  return (
    <div className="card table-scroll">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr
            className="border-b"
            style={{
              borderColor: "rgb(var(--border))",
              background: "rgb(var(--surface-2))",
            }}
          >
            <th className="th w-12 !px-2 !text-center">#</th>
            <th className="th !px-2">Team</th>
            <th className="th hidden !text-center sm:table-cell">Record</th>
            <th className="th !text-center">Index</th>
            {COMPOSITE_SOURCES.map((s) => (
              <th key={s.key} className="th !text-center">
                {s.label}
              </th>
            ))}
            <th className="th !px-2 !text-right sm:!pr-4">Avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.team}
              className="border-b last:border-0"
              style={{
                borderColor: "rgb(var(--border) / 0.7)",
                opacity: muted ? 0.8 : 1,
              }}
            >
              <td
                className={`td !px-2 !text-center ${r.classification ? `stripe-${r.classification}` : ""}`}
              >
                <span className="text-[13px] font-bold tnum">{r.rank}</span>
              </td>
              <td className="td !px-2">
                {r.slug ? (
                  <Link
                    href={`/team/${r.slug}`}
                    className="text-[13.5px] font-semibold hover:underline"
                  >
                    {r.team}
                  </Link>
                ) : (
                  <span className="text-[13.5px] font-semibold">{r.team}</span>
                )}
                {r.classification && (
                  <span
                    className="ml-1.5 text-[11px]"
                    style={{ color: "rgb(var(--text-faint))" }}
                  >
                    {r.classification}
                  </span>
                )}
              </td>
              <td
                className="td hidden !text-center text-[12px] tnum sm:table-cell"
                style={{ color: "rgb(var(--text-muted))" }}
              >
                {record.get(r.team) ?? "—"}
              </td>
              <Num v={r.ours} strong />
              {COMPOSITE_SOURCES.map((s) => (
                <Num key={s.key} v={r[s.key]} />
              ))}
              <td className="td !px-2 !text-right sm:!pr-4">
                <span
                  className="text-[15px] font-extrabold tnum"
                  style={{ color: "rgb(var(--rating))" }}
                >
                  {r.average?.toFixed(2) ?? "—"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Num({ v, strong }: { v: number | null; strong?: boolean }) {
  return (
    <td
      className={`td !text-center text-[12.5px] tnum ${strong ? "font-semibold" : ""}`}
      style={v === null ? { color: "rgb(var(--text-faint))" } : undefined}
    >
      {v ?? "—"}
    </td>
  );
}
