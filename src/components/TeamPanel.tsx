"use client";

import { useEffect } from "react";
import Icon from "./Icon";
import {
  MIN_GAMES_FOR_EFFICIENCY,
  SHOW_EFFICIENCY,
  fmt,
  fmtSigned,
  ordinal,
  record,
  weekLabel,
} from "@/lib/format";
import {
  buildTeamView,
  PERFORMANCE_LABELS,
  type ScheduleEntry,
} from "@/lib/team-view";
import type { Performance } from "@/lib/engine";
import type { RatingsPayload } from "@/lib/types";

/**
 * Full team profile as a drawer over the rankings, so a name can be checked
 * without losing your place in the table. /team/[slug] still renders the same
 * information as its own page for deep links.
 */
export default function TeamPanel({
  payload,
  slug,
  onClose,
  columnRanks,
}: {
  payload: RatingsPayload;
  slug: string | null;
  onClose: () => void;
  columnRanks: {
    sos: Map<string, number>;
    oEff: Map<string, number>;
    dEff: Map<string, number>;
    ppg: Map<string, number>;
    papg: Map<string, number>;
  };
}) {
  useEffect(() => {
    if (!slug) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll while the drawer is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [slug, onClose]);

  if (!slug) return null;
  const view = buildTeamView(payload, slug);
  if (!view) return null;

  const { rating: t, schedule } = view;
  const played = t.wins + t.losses > 0;
  const eff = t.wins + t.losses >= MIN_GAMES_FOR_EFFICIENCY;
  const classCount = payload.ratings.filter(
    (r) => r.classification === t.classification,
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        className="absolute inset-0 bg-black/55 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Close team profile"
      />

      <aside
        className="scroll-thin relative flex h-full w-full max-w-[620px] flex-col overflow-y-auto border-l"
        style={{
          background: "rgb(var(--surface))",
          borderColor: "rgb(var(--border))",
          boxShadow: "var(--shadow)",
        }}
        role="dialog"
        aria-label={`${t.name} profile`}
      >
        {/* Header. The class colour runs the full width as a top rule so the
            panel is identifiable at a glance before anything is read. */}
        <div
          className={`sticky top-0 z-10 border-b px-5 py-4 cls-${t.classification}`}
          style={{
            background: "rgb(var(--surface))",
            borderColor: "rgb(var(--border))",
            borderTop: "3px solid rgb(var(--c))",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-[27px] font-extrabold leading-tight tracking-[-0.03em]">
                {t.name}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className="chip !px-2 !py-1 !text-[12px] !font-extrabold"
                  style={{
                    background: "rgb(var(--c) / 0.16)",
                    color: "rgb(var(--c))",
                  }}
                >
                  {t.classification}
                </span>
                <span
                  className="text-[13px] font-medium"
                  style={{ color: "rgb(var(--text-muted))" }}
                >
                  Region {t.region}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-start gap-3">
              <div className="text-right">
                <div
                  className="text-[38px] font-extrabold leading-none tracking-[-0.04em] tnum"
                  style={{ color: "rgb(var(--rating))" }}
                >
                  {fmt(t.rating, 1)}
                </div>
                <div
                  className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.09em]"
                  style={{ color: "rgb(var(--text-faint))" }}
                >
                  Index Rating
                </div>
                <div className="mt-2 flex justify-end gap-1.5">
                  <RankBadge label={`#${t.rank} overall`} tone="brand" />
                  <RankBadge
                    label={`#${t.class_rank} in ${t.classification}`}
                    tone="class"
                  />
                </div>
              </div>
              <button
                onClick={onClose}
                className="btn !h-8 !w-8 !p-0"
                aria-label="Close"
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Stat strip */}
        <div
          className="grid grid-cols-3 border-b sm:grid-cols-5"
          style={{
            borderColor: "rgb(var(--border))",
            background: "rgb(var(--surface-2))",
          }}
        >
          <StatCell label="Record" value={record(t.wins, t.losses)} />
          <StatCell
            label="SOS"
            value={played ? fmt(t.sos, 1) : "—"}
            rank={played ? columnRanks.sos.get(t.slug) : undefined}
          />
          {SHOW_EFFICIENCY && (
            <>
              <StatCell
                label="O-Eff"
                value={eff ? fmtSigned(t.o_eff) : "—"}
                rank={eff ? columnRanks.oEff.get(t.slug) : undefined}
                tone={eff ? t.o_eff : undefined}
              />
              <StatCell
                label="D-Eff"
                value={eff ? fmtSigned(t.d_eff) : "—"}
                rank={eff ? columnRanks.dEff.get(t.slug) : undefined}
                tone={eff ? t.d_eff : undefined}
              />
            </>
          )}
          <StatCell
            label="PF/G · PA/G"
            value={played ? `${fmt(t.ppg, 1)} / ${fmt(t.papg, 1)}` : "—"}
          />
        </div>

        {/* Schedule */}
        <div className="px-4 py-4 sm:px-5">
          <h3
            className="mb-3 text-[11px] font-bold uppercase tracking-[0.09em]"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            {payload.config ? "2026" : ""} Schedule
          </h3>

          {schedule.length === 0 ? (
            <p
              className="py-10 text-center text-sm"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              No games on file — {t.name} is not on any imported schedule yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {schedule.map((e, i) => (
                <ScheduleRow key={i} e={e} />
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        <div
          className="border-t px-5 py-3"
          style={{ borderColor: "rgb(var(--border))" }}
        >
          <a
            href={`/team/${t.slug}`}
            className="text-[12px] hover:underline"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            Open as a full page →
          </a>
        </div>
      </aside>
    </div>
  );
}

/** Small pill carrying a rank, in the brand red or the team's class colour. */
function RankBadge({
  label,
  tone,
}: {
  label: string;
  tone: "brand" | "class";
}) {
  const c = tone === "brand" ? "var(--brand)" : "var(--c)";
  return (
    <span
      className="rounded px-1.5 py-[3px] text-[10px] font-bold leading-none"
      style={{ background: `rgb(${c} / 0.15)`, color: `rgb(${c})` }}
    >
      {label}
    </span>
  );
}

function StatCell({
  label,
  value,
  rank,
  tone,
}: {
  label: string;
  value: string;
  rank?: number;
  tone?: number;
}) {
  const color =
    tone === undefined
      ? "rgb(var(--text))"
      : tone > 0.5
        ? "rgb(var(--good))"
        : tone < -0.5
          ? "rgb(var(--bad))"
          : "rgb(var(--text))";
  return (
    <div
      className="border-r px-2 py-3 text-center last:border-r-0"
      style={{ borderColor: "rgb(var(--border))" }}
    >
      <div
        className="text-[19px] font-extrabold leading-none tracking-[-0.03em] tnum"
        style={{ color }}
      >
        {value}
      </div>
      {rank !== undefined && (
        <div className="mt-1.5">
          <span
            className="rounded px-1 py-[2px] text-[9.5px] font-bold leading-none"
            style={{
              background: "rgb(var(--brand) / 0.14)",
              color: "rgb(var(--brand))",
            }}
          >
            #{rank}
          </span>
        </div>
      )}
      <div
        className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.07em]"
        style={{ color: "rgb(var(--text-faint))" }}
      >
        {label}
      </div>
    </div>
  );
}

function ScheduleRow({ e }: { e: ScheduleEntry }) {
  const diff =
    e.actual !== null && e.expected !== null ? e.actual - e.expected : null;

  const playoff = e.game.type === "playoff";

  return (
    <div
      className={`rounded-lg px-2.5 py-2 ${e.opponentClass ? `cls-${e.opponentClass}` : ""}`}
      style={{ background: "rgb(var(--surface-2))" }}
    >
      <div className="flex items-center gap-2">
        {/* Playoff rows leave this blank: the round is named on its own chip
            below, and "Quarterfinals" does not fit a week-sized slot. */}
        <span
          className="w-[30px] shrink-0 text-[10.5px] font-bold uppercase"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          {playoff ? "" : weekLabel(e.game).replace("Week ", "Wk ")}
        </span>

        {e.played ? (
          <span
            className="w-4 shrink-0 text-center text-[14px] font-extrabold"
            style={{ color: e.won ? "rgb(var(--good))" : "rgb(var(--bad))" }}
          >
            {e.actual === 0 ? "T" : e.won ? "W" : "L"}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <span
          className="shrink-0 text-[11px]"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          {e.isHome || e.game.neutral_site ? "vs" : "at"}
        </span>

        <span className="truncate text-[14.5px] font-bold">{e.opponent}</span>

        {e.opponentClass ? (
          <span
            className="shrink-0 rounded px-1 py-[2px] text-[9.5px] font-extrabold leading-none"
            style={{
              background: "rgb(var(--c) / 0.16)",
              color: "rgb(var(--c))",
            }}
          >
            {e.opponentClass}
          </span>
        ) : (
          <span
            className="shrink-0 rounded px-1 py-[2px] text-[9.5px] font-bold leading-none"
            style={{
              background: "rgb(var(--surface-3))",
              color: "rgb(var(--text-faint))",
            }}
          >
            OOS
          </span>
        )}

        {playoff && (
          <span
            className="shrink-0 rounded px-1 py-[2px] text-[9.5px] font-extrabold leading-none"
            style={{
              background: "rgb(var(--brand) / 0.16)",
              color: "rgb(var(--brand))",
            }}
          >
            {weekLabel(e.game).replace("Playoffs ", "").toUpperCase()}
          </span>
        )}

        <span className="ml-auto shrink-0 text-right">
          {e.played ? (
            <span className="text-[15px] font-extrabold tnum">
              <span style={{ color: e.won ? "rgb(var(--good))" : undefined }}>
                {e.teamScore}
              </span>
              <span style={{ color: "rgb(var(--text-faint))" }}>–</span>
              <span style={{ color: e.won ? undefined : "rgb(var(--bad))" }}>
                {e.oppScore}
              </span>
            </span>
          ) : (
            <span
              className="text-[10.5px] font-bold uppercase tracking-wide"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              Upcoming
            </span>
          )}
        </span>
      </div>

      <div
        className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-[52px] text-[11px]"
        style={{ color: "rgb(var(--text-faint))" }}
      >
        {e.opponentRank && <span className="tnum">#{e.opponentRank} overall</span>}
        {!e.opponentRank && <span>Out-of-state</span>}
        {e.expected !== null && (
          <span className="tnum">Exp {fmtSigned(e.expected, 0)}</span>
        )}
        {e.actual !== null && (
          <span className="tnum">Act {fmtSigned(e.actual, 0)}</span>
        )}
        {e.performance && diff !== null && (
          <PerformanceChip p={e.performance} diff={diff} />
        )}
      </div>
    </div>
  );
}

function PerformanceChip({ p, diff }: { p: Performance; diff: number }) {
  // Solid enough to read as a verdict rather than as more small print — this
  // is the one thing on the row that is a judgement rather than a figure.
  const style: Record<Performance, { bg: string; fg: string }> = {
    dominant: { bg: "rgb(var(--good) / 0.2)", fg: "rgb(var(--good))" },
    exceeded: { bg: "rgb(var(--good) / 0.12)", fg: "rgb(var(--good))" },
    "as-expected": {
      bg: "rgb(var(--text-muted) / 0.15)",
      fg: "rgb(var(--text-muted))",
    },
    below: { bg: "rgb(var(--bad) / 0.18)", fg: "rgb(var(--bad))" },
  };
  const s = style[p];
  const short: Record<Performance, string> = {
    dominant: "Dominant",
    exceeded: "Exceeded",
    "as-expected": "Expected",
    below: "Below Exp",
  };
  return (
    <span
      className="shrink-0 rounded px-1.5 py-[3px] text-[10px] font-extrabold leading-none"
      style={{ background: s.bg, color: s.fg }}
      title={PERFORMANCE_LABELS[p]}
    >
      {short[p]} ({fmtSigned(diff, 0)})
    </span>
  );
}
