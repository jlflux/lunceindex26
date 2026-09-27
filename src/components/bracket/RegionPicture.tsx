import Link from "next/link";
import type { SeededTeam } from "@/lib/bracket";
import { STATUS_LABELS, type StatusKey } from "@/lib/bracket-types";

/**
 * One region's table, with the write-up under it.
 *
 * The status pill is the one piece of the old bracketology site that changes
 * meaning here rather than moving across. It used to be a judgement typed into
 * a dropdown; now "Clinched" and "Out" are the arithmetic proofs the odds page
 * uses, and the three in between read off the simulated share. An override
 * still wins — it just is not the only source any more.
 */
const TONE: Record<StatusKey, { bg: string; fg: string }> = {
  clinched: { bg: "rgb(var(--odds-hi) / 0.18)", fg: "rgb(var(--odds-hi))" },
  high: { bg: "rgb(var(--good-soft))", fg: "rgb(var(--good))" },
  medium: { bg: "rgb(var(--warn-soft))", fg: "rgb(var(--warn))" },
  low: { bg: "rgb(var(--bad-soft))", fg: "rgb(var(--bad))" },
  out: { bg: "rgb(var(--surface-3))", fg: "rgb(var(--text-faint))" },
  ineligible: { bg: "rgb(var(--warn-soft))", fg: "rgb(var(--warn))" },
};

/**
 * What the pill means, and what the model separately makes of the same team.
 *
 * Both, and named as two different things. The pill is a person's confidence
 * about where a team finishes; the percentages are what ten thousand
 * simulated seasons made of its chances. They are allowed to disagree, and a
 * reader should be able to see where they do — but the tooltip used to print
 * only the percentage, which read as though it were the reason for the label.
 *
 * The seed share rather than the chance of qualifying, because the pill is
 * about *where* a team finishes, and "87% to reach the playoffs" says nothing
 * about whether it stays fourth.
 */
function statusTitle(t: SeededTeam): string {
  const label = STATUS_LABELS[t.status];
  if (t.ineligible) return `${label} — barred from the postseason.`;

  const pct = (v: number) =>
    `${(v * 100).toFixed(v > 0.005 && v < 0.995 ? 0 : 1)}%`;
  const math: string[] = [];
  if (t.playoff !== null) math.push(`${pct(t.playoff)} to qualify`);
  if (t.seed_odds !== null) math.push(`${pct(t.seed_odds)} to hold this seed`);
  if (t.place_locked) math.push("this place is already settled");
  else if (t.best_place && t.worst_place && t.best_place !== t.worst_place) {
    math.push(`can still finish ${t.best_place}\u2013${t.worst_place}`);
  }

  return math.length
    ? `${label} — our confidence in where they finish. The model separately: ${math.join(", ")}.`
    : `${label} — our confidence in where they finish.`;
}

export default function RegionPicture({
  region,
  teams,
  note,
}: {
  region: number;
  teams: SeededTeam[];
  note?: string;
}) {
  return (
    <div className="card overflow-hidden">
      <div
        className="border-b px-3 py-2 text-[11px] font-bold uppercase tracking-wider"
        style={{
          borderColor: "rgb(var(--border))",
          background: "rgb(var(--surface-2))",
          color: "rgb(var(--text-faint))",
        }}
      >
        Region {region}
      </div>

      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            {["", "Team", "Overall", "Region", "Status"].map((h, i) => (
              <th
                key={h || i}
                className={`border-b px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
                  i === 1 ? "text-left" : "text-center"
                }`}
                style={{
                  borderColor: "rgb(var(--border))",
                  color: "rgb(var(--text-faint))",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => {
            // The line under the last qualifying team. Barred teams sit below
            // it by construction, so the rule is drawn after the last one that
            // actually holds a place.
            const next = teams[i + 1];
            const cut = t.qualifies && next !== undefined && !next.qualifies;
            return (
              <tr key={t.slug} style={{ opacity: t.ineligible ? 0.55 : 1 }}>
                <Cell cut={cut} className="w-7 text-center">
                  <span
                    className="text-[11px] tnum"
                    style={{ color: "rgb(var(--text-faint))" }}
                  >
                    {t.ineligible ? "—" : t.place}
                  </span>
                </Cell>
                <Cell cut={cut} className="text-left">
                  <Link
                    href={`/team/${t.slug}`}
                    className="text-[13px] font-semibold hover:underline"
                  >
                    {t.name}
                  </Link>
                </Cell>
                <Cell cut={cut} className="text-center">
                  <span className="text-[12px] tnum" style={{ color: "rgb(var(--text-muted))" }}>
                    {t.wins}-{t.losses}
                  </span>
                </Cell>
                <Cell cut={cut} className="text-center">
                  <span className="text-[12px] font-semibold tnum">
                    {t.ineligible
                      ? "—"
                      : `${t.region_w}-${t.region_l}${t.region_t ? `-${t.region_t}` : ""}`}
                  </span>
                </Cell>
                <Cell cut={cut} className="text-center">
                  <span
                    className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                    style={{
                      background: TONE[t.status].bg,
                      color: TONE[t.status].fg,
                    }}
                    title={statusTitle(t)}
                  >
                    {STATUS_LABELS[t.status]}
                  </span>
                </Cell>
              </tr>
            );
          })}
        </tbody>
      </table>

      {note && (
        <div
          className="border-t px-3 py-2.5"
          style={{ borderColor: "rgb(var(--border))" }}
        >
          <div
            className="mb-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            Region picture
          </div>
          <p
            className="whitespace-pre-wrap text-[12.5px] leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            {note}
          </p>
        </div>
      )}
    </div>
  );
}

function Cell({
  children,
  cut,
  className = "",
}: {
  children: React.ReactNode;
  cut?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-2 py-1.5 ${className}`}
      style={{
        borderBottom: cut
          ? "2px solid rgb(var(--brand) / 0.55)"
          : "1px solid rgb(var(--border) / 0.6)",
      }}
    >
      {children}
    </td>
  );
}
