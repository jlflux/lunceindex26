import Link from "next/link";
import { notFound } from "next/navigation";
import ClassBadge from "@/components/ClassBadge";
import SiteHeader from "@/components/SiteHeader";
import { loadRatings } from "@/lib/data";
import { fmt, fmtPct, fmtSigned, ordinal, record, weekLabel } from "@/lib/format";
import {
  buildTeamView,
  PERFORMANCE_LABELS,
  type ScheduleEntry,
} from "@/lib/team-view";
import type { Performance } from "@/lib/engine";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadRatings();
  const view = buildTeamView(data, slug);
  if (!view) return { title: "Team not found" };
  return {
    title: view.rating.name,
    description: `${view.rating.name} — ${view.rating.classification} · rated ${fmt(
      view.rating.rating,
    )}, ${ordinal(view.rating.rank)} overall in the ALPreps Index.`,
  };
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadRatings();
  const view = buildTeamView(data, slug);
  if (!view) notFound();

  const { rating: t, rpi, schedule } = view;
  const hasPlayed = t.wins + t.losses > 0;

  return (
    <>
      <SiteHeader generated={data.generated} />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/"
          className="text-sm font-medium hover:underline"
          style={{ color: "rgb(var(--text-muted))" }}
        >
          ← All teams
        </Link>

        {/* Identity */}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              {t.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <ClassBadge classification={t.classification} region={t.region} />
              <span
                className="text-sm font-medium"
                style={{ color: "rgb(var(--text-muted))" }}
              >
                {record(t.wins, t.losses)}
              </span>
            </div>
          </div>

          <div className="text-right">
            <div
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              Rating
            </div>
            <div className="text-3xl font-extrabold tabular-nums">
              {fmt(t.rating)}
            </div>
            <div className="text-xs" style={{ color: "rgb(var(--text-muted))" }}>
              {ordinal(t.rank)} overall · {ordinal(t.class_rank)} in{" "}
              {t.classification}
            </div>
          </div>
        </div>

        {/* Rating inputs */}
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider">
            Rating breakdown
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <Metric
              label="Massey"
              value={fmt(t.massey)}
              hint="Iterative solve before adjustments"
            />
            <Metric
              label="Strength of schedule"
              value={t.sos > 0 ? fmt(t.sos) : "—"}
              hint="Mean rating of opponents faced"
            />
            <Metric
              label="Off. efficiency"
              value={hasPlayed ? fmtSigned(t.o_eff) : "—"}
              hint="Scoring vs what opponents usually allow"
              tone={hasPlayed ? t.o_eff : undefined}
            />
            <Metric
              label="Def. efficiency"
              value={hasPlayed ? fmtSigned(t.d_eff) : "—"}
              hint="Points allowed vs what opponents usually score"
              tone={hasPlayed ? t.d_eff : undefined}
            />
            <Metric
              label="Points / game"
              value={hasPlayed ? fmt(t.ppg, 1) : "—"}
            />
            <Metric
              label="Points allowed / game"
              value={hasPlayed ? fmt(t.papg, 1) : "—"}
            />
            <Metric
              label="Preseason carry-over"
              value={`${Math.round(t.prior_blend * 100)}%`}
              hint="Weight still given to last season"
            />
            {rpi && (
              <Metric
                label="RPI"
                value={fmt(rpi.rpi, 4)}
                hint={`${ordinal(rpi.rank)} overall`}
              />
            )}
          </div>
        </section>

        {/* RPI detail */}
        {rpi && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider">
              RPI components
            </h2>
            <div className="card grid grid-cols-3 divide-x" style={{ borderColor: "rgb(var(--border))" }}>
              <RpiPart label="Win %" weight="25%" value={fmtPct(rpi.win_pct)} />
              <RpiPart
                label="Opp win %"
                weight="50%"
                value={fmtPct(rpi.opp_win_pct)}
              />
              <RpiPart
                label="Opp opp win %"
                weight="25%"
                value={fmtPct(rpi.opp_opp_win_pct)}
              />
            </div>
          </section>
        )}

        {/* Schedule */}
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider">
            Schedule &amp; results
          </h2>
          {schedule.length === 0 ? (
            <div
              className="card px-4 py-10 text-center text-sm"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              No games on file yet.
            </div>
          ) : (
            <div className="space-y-2">
              {schedule.map((e, i) => (
                <ScheduleRow key={i} e={e} />
              ))}
            </div>
          )}
        </section>

        <p
          className="mt-6 text-xs leading-relaxed"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          Projected margins come from the rating gap plus home-field advantage.
          A result is &ldquo;dominant&rdquo; when it beats the projection by{" "}
          {data.config.perf_dominant_band}+ points, &ldquo;exceeded&rdquo; when
          it beats it by more than {data.config.perf_expected_band}, and
          &ldquo;below expectation&rdquo; when it falls short by more than{" "}
          {data.config.perf_expected_band}.
        </p>
      </main>
    </>
  );
}

function ScheduleRow({ e }: { e: ScheduleEntry }) {
  return (
    <div className="card px-3 py-3">
      <div className="flex items-center gap-3">
        <div className="w-[86px] shrink-0">
          <div
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            {weekLabel(e.game)}
          </div>
          <div className="text-[11px]" style={{ color: "rgb(var(--text-faint))" }}>
            {e.game.neutral_site ? "Neutral" : e.isHome ? "Home" : "Away"}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm">
            <span style={{ color: "rgb(var(--text-faint))" }}>
              {e.game.neutral_site ? "vs" : e.isHome ? "vs" : "at"}
            </span>
            {e.opponentSlug ? (
              <Link
                href={`/team/${e.opponentSlug}`}
                className="truncate font-semibold hover:underline"
              >
                {e.opponent}
              </Link>
            ) : (
              <span className="truncate font-semibold">
                {e.opponent}
                <span
                  className="ml-1.5 text-[10px] font-semibold uppercase"
                  style={{ color: "rgb(var(--text-faint))" }}
                >
                  non-AHSAA
                </span>
              </span>
            )}
          </div>
          <div
            className="mt-0.5 text-[11px]"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            {e.opponentRank
              ? `#${e.opponentRank} · ${fmt(e.opponentRating as number)}`
              : "Unrated opponent"}
            {e.expected !== null && ` · projected ${fmtSigned(e.expected, 1)}`}
          </div>
        </div>

        <div className="shrink-0 text-right">
          {e.played ? (
            <>
              <div className="flex items-center justify-end gap-1.5">
                <span
                  className="chip"
                  style={{
                    background: e.won
                      ? "rgb(var(--good) / 0.14)"
                      : "rgb(var(--bad) / 0.14)",
                    color: e.won ? "rgb(var(--good))" : "rgb(var(--bad))",
                  }}
                >
                  {e.actual === 0 ? "T" : e.won ? "W" : "L"}
                </span>
                <span className="text-sm font-bold tabular-nums">
                  {e.teamScore}–{e.oppScore}
                </span>
              </div>
              {e.performance && (
                <div className="mt-1">
                  <PerformanceChip p={e.performance} />
                </div>
              )}
            </>
          ) : (
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              Upcoming
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PerformanceChip({ p }: { p: Performance }) {
  const styles: Record<Performance, { bg: string; fg: string }> = {
    dominant: { bg: "rgb(var(--good) / 0.18)", fg: "rgb(var(--good))" },
    exceeded: { bg: "rgb(var(--good) / 0.10)", fg: "rgb(var(--good))" },
    "as-expected": {
      bg: "rgb(var(--surface-2))",
      fg: "rgb(var(--text-muted))",
    },
    below: { bg: "rgb(var(--bad) / 0.12)", fg: "rgb(var(--bad))" },
  };
  const s = styles[p];
  return (
    <span className="chip" style={{ background: s.bg, color: s.fg }}>
      {PERFORMANCE_LABELS[p]}
    </span>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: number;
}) {
  const color =
    tone === undefined
      ? undefined
      : tone > 0.5
        ? "rgb(var(--good))"
        : tone < -0.5
          ? "rgb(var(--bad))"
          : undefined;
  return (
    <div className="card px-3 py-2.5">
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "rgb(var(--text-faint))" }}
      >
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
      {hint && (
        <div
          className="mt-0.5 text-[10px] leading-tight"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function RpiPart({
  label,
  weight,
  value,
}: {
  label: string;
  weight: string;
  value: string;
}) {
  return (
    <div className="px-3 py-3 text-center">
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "rgb(var(--text-faint))" }}
      >
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px]" style={{ color: "rgb(var(--text-faint))" }}>
        weight {weight}
      </div>
    </div>
  );
}
