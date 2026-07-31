import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
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
  const view = buildTeamView(await loadRatings(), slug);
  if (!view) return { title: "Team not found" };
  return {
    title: view.rating.name,
    description: `${view.rating.name} — ${view.rating.classification}, rated ${fmt(
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
    <AppShell generated={data.generated}>
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline"
        style={{ color: "rgb(var(--text-muted))" }}
      >
        <Icon name="arrow-left" size={14} />
        All teams
      </Link>

      {/* Identity banner */}
      <div className="card card-lift mb-5 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-5 p-5">
          <div className="min-w-0">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">
              {t.name}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className={`chip cls-${t.classification} !px-2 !py-1`}>
                Class {t.classification}
              </span>
              <span
                className="chip"
                style={{
                  background: "rgb(var(--surface-3))",
                  color: "rgb(var(--text-muted))",
                }}
              >
                Region {t.region}
              </span>
              <span
                className="chip"
                style={{
                  background: "rgb(var(--surface-3))",
                  color: "rgb(var(--text-muted))",
                }}
              >
                {record(t.wins, t.losses)}
              </span>
            </div>
          </div>

          <div className="flex items-stretch gap-3">
            <BigStat
              label="Rating"
              value={fmt(t.rating)}
              sub={`${ordinal(t.rank)} overall`}
              accent
            />
            <BigStat
              label={`In ${t.classification}`}
              value={ordinal(t.class_rank)}
              sub={`of ${
                data.ratings.filter(
                  (r) => r.classification === t.classification,
                ).length
              } teams`}
            />
            {rpi && (
              <BigStat
                label="RPI"
                value={rpi.rpi.toFixed(4)}
                sub={`${ordinal(rpi.rank)} overall`}
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        {/* Schedule */}
        <section className="order-2 lg:order-1">
          <SectionTitle icon="calendar">Schedule &amp; results</SectionTitle>
          {schedule.length === 0 ? (
            <div
              className="card px-4 py-14 text-center text-sm"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              No games on file yet — {t.name} is not on any schedule that has
              been imported.
            </div>
          ) : (
            <div className="space-y-2">
              {schedule.map((e, i) => (
                <ScheduleRow key={i} e={e} />
              ))}
            </div>
          )}

          {schedule.length > 0 && (
            <p
              className="mt-3 text-xs leading-relaxed"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              Projected margins come from the rating gap plus home-field
              advantage. A result is <strong>dominant</strong> when it beats the
              projection by {data.config.perf_dominant_band}+ points,{" "}
              <strong>exceeded</strong> when it beats it by more than{" "}
              {data.config.perf_expected_band}, and{" "}
              <strong>below expectation</strong> when it falls short by more
              than {data.config.perf_expected_band}.
            </p>
          )}
        </section>

        {/* Breakdown */}
        <aside className="order-1 space-y-5 lg:order-2">
          <div>
            <SectionTitle icon="sliders">Rating breakdown</SectionTitle>
            <div className="card divide-y" style={{ borderColor: "rgb(var(--border))" }}>
              <Metric
                label="Massey"
                value={fmt(t.massey)}
                hint="Iterative solve, before adjustments"
              />
              <Metric
                label="Strength of schedule"
                value={hasPlayed ? fmt(t.sos) : "—"}
                hint="Mean rating of opponents faced"
              />
              <Metric
                label="Offensive efficiency"
                value={hasPlayed ? fmtSigned(t.o_eff) : "—"}
                hint="Scoring vs what opponents usually allow"
                tone={hasPlayed ? t.o_eff : undefined}
              />
              <Metric
                label="Defensive efficiency"
                value={hasPlayed ? fmtSigned(t.d_eff) : "—"}
                hint="Points allowed vs what opponents usually score"
                tone={hasPlayed ? t.d_eff : undefined}
              />
              <Metric
                label="Points per game"
                value={hasPlayed ? fmt(t.ppg, 1) : "—"}
              />
              <Metric
                label="Points allowed per game"
                value={hasPlayed ? fmt(t.papg, 1) : "—"}
              />
              <Metric
                label="Preseason carry-over"
                value={`${Math.round(t.prior_blend * 100)}%`}
                hint="Weight still given to last season"
              />
            </div>
          </div>

          {rpi && (
            <div>
              <SectionTitle icon="chart">RPI components</SectionTitle>
              <div className="card divide-y" style={{ borderColor: "rgb(var(--border))" }}>
                <Metric
                  label="Win percentage"
                  value={fmtPct(rpi.win_pct)}
                  hint="25% of RPI"
                />
                <Metric
                  label="Opponents' win %"
                  value={fmtPct(rpi.opp_win_pct)}
                  hint="50% of RPI"
                />
                <Metric
                  label="Opponents' opponents' win %"
                  value={fmtPct(rpi.opp_opp_win_pct)}
                  hint="25% of RPI"
                />
              </div>
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function SectionTitle({
  icon,
  children,
}: {
  icon: "calendar" | "sliders" | "chart";
  children: React.ReactNode;
}) {
  return (
    <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider">
      <Icon name={icon} size={14} className="opacity-45" />
      {children}
    </h2>
  );
}

function BigStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-right"
      style={{
        background: accent ? "rgb(var(--brand-soft))" : "rgb(var(--surface-2))",
      }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: "rgb(var(--text-faint))" }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-[26px] font-extrabold leading-none tnum"
        style={{ color: accent ? "rgb(var(--brand))" : "rgb(var(--text))" }}
      >
        {value}
      </div>
      <div
        className="mt-1 text-[11px] whitespace-nowrap"
        style={{ color: "rgb(var(--text-faint))" }}
      >
        {sub}
      </div>
    </div>
  );
}

function ScheduleRow({ e }: { e: ScheduleEntry }) {
  return (
    <div className="card row-hover px-3.5 py-3 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-[74px] shrink-0">
          <div
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            {weekLabel(e.game)}
          </div>
          <div
            className="mt-0.5 text-[11px]"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            {e.game.neutral_site ? "Neutral" : e.isHome ? "Home" : "Away"}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[13px]"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              {e.isHome || e.game.neutral_site ? "vs" : "at"}
            </span>
            {e.opponentSlug ? (
              <Link
                href={`/team/${e.opponentSlug}`}
                className="truncate text-sm font-semibold hover:underline"
              >
                {e.opponent}
              </Link>
            ) : (
              <span className="truncate text-sm font-semibold">
                {e.opponent}
              </span>
            )}
          </div>
          <div
            className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            {e.opponentRank ? (
              <span>
                #{e.opponentRank} · {fmt(e.opponentRating as number)}
              </span>
            ) : (
              <span>Non-AHSAA · unrated</span>
            )}
            {e.expected !== null && (
              <span>Projected {fmtSigned(e.expected, 1)}</span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          {e.played ? (
            <>
              <div className="flex items-center justify-end gap-1.5">
                <span
                  className="chip !px-1.5"
                  style={{
                    background:
                      e.actual === 0
                        ? "rgb(var(--surface-3))"
                        : e.won
                          ? "rgb(var(--good-soft))"
                          : "rgb(var(--bad-soft))",
                    color:
                      e.actual === 0
                        ? "rgb(var(--text-muted))"
                        : e.won
                          ? "rgb(var(--good))"
                          : "rgb(var(--bad))",
                  }}
                >
                  {e.actual === 0 ? "T" : e.won ? "W" : "L"}
                </span>
                <span className="text-sm font-extrabold tnum">
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
              className="chip"
              style={{
                background: "rgb(var(--surface-3))",
                color: "rgb(var(--text-faint))",
              }}
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
    dominant: { bg: "rgb(var(--good-soft))", fg: "rgb(var(--good))" },
    exceeded: { bg: "rgb(var(--good) / 0.08)", fg: "rgb(var(--good))" },
    "as-expected": {
      bg: "rgb(var(--surface-3))",
      fg: "rgb(var(--text-muted))",
    },
    below: { bg: "rgb(var(--bad-soft))", fg: "rgb(var(--bad))" },
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
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{label}</div>
        {hint && (
          <div
            className="mt-0.5 text-[11px] leading-tight"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            {hint}
          </div>
        )}
      </div>
      <div className="text-[15px] font-extrabold tnum" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
