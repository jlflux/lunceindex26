"use client";

import { useEffect } from "react";
import Icon from "./Icon";
import { fmt, fmtSigned, ordinal, record, weekLabel } from "@/lib/format";
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
        {/* Header */}
        <div
          className="sticky top-0 z-10 border-b px-5 py-4"
          style={{
            background: "rgb(var(--surface))",
            borderColor: "rgb(var(--border))",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-[24px] font-bold leading-tight">
                {t.name}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`chip cls-${t.classification}`}>
                  {t.classification}
                </span>
                <span
                  className="text-[12px]"
                  style={{ color: "rgb(var(--text-muted))" }}
                >
                  Region {t.region}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-start gap-3">
              <div className="text-right">
                <div
                  className="text-[28px] font-extrabold leading-none tnum"
                  style={{ color: "rgb(var(--rating))" }}
                >
                  {fmt(t.rating)}
                </div>
                <div
                  className="mt-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "rgb(var(--text-faint))" }}
                >
                  Index Rating
                </div>
                <div
                  className="mt-1 text-[11px]"
                  style={{ color: "rgb(var(--text-muted))" }}
                >
                  #{t.rank} overall · #{t.class_rank} in {t.classification}
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
          style={{ borderColor: "rgb(var(--border))" }}
        >
          <StatCell label="Record" value={record(t.wins, t.losses)} />
          <StatCell
            label="SOS"
            value={played ? fmt(t.sos, 1) : "—"}
            rank={played ? columnRanks.sos.get(t.slug) : undefined}
            classRank={t.classification}
          />
          <StatCell
            label="O-Eff"
            value={played ? fmtSigned(t.o_eff) : "—"}
            rank={played ? columnRanks.oEff.get(t.slug) : undefined}
            tone={played ? t.o_eff : undefined}
          />
          <StatCell
            label="D-Eff"
            value={played ? fmtSigned(t.d_eff) : "—"}
            rank={played ? columnRanks.dEff.get(t.slug) : undefined}
            tone={played ? t.d_eff : undefined}
          />
          <StatCell
            label="PF/G · PA/G"
            value={played ? `${fmt(t.ppg, 1)} / ${fmt(t.papg, 1)}` : "—"}
          />
        </div>

        {/* Schedule */}
        <div className="px-5 py-4">
          <h3
            className="mb-3 text-[11px] font-bold uppercase tracking-wider"
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
            <div className="space-y-1">
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

function StatCell({
  label,
  value,
  rank,
  tone,
  classRank,
}: {
  label: string;
  value: string;
  rank?: number;
  tone?: number;
  classRank?: string;
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
      className="border-r px-3 py-3 text-center last:border-r-0"
      style={{ borderColor: "rgb(var(--border))" }}
    >
      <div className="text-[15px] font-bold tnum" style={{ color }}>
        {value}
      </div>
      {rank !== undefined && (
        <div
          className="mt-0.5 text-[10px] font-semibold"
          style={{ color: "rgb(var(--brand))" }}
        >
          #{rank}
          {classRank && (
            <span style={{ color: "rgb(var(--text-faint))" }}> overall</span>
          )}
        </div>
      )}
      <div
        className="mt-1 text-[10px] font-semibold uppercase tracking-wider"
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

  return (
    <div
      className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[12.5px]"
      style={{ background: "rgb(var(--surface-2))" }}
    >
      <span
        className="w-[34px] shrink-0 text-[10.5px] font-semibold uppercase"
        style={{ color: "rgb(var(--text-faint))" }}
      >
        {weekLabel(e.game).replace("Week ", "Wk ").replace("Playoffs ", "")}
      </span>

      {e.played ? (
        <span
          className="w-4 shrink-0 text-center font-bold"
          style={{
            color: e.won ? "rgb(var(--good))" : "rgb(var(--bad))",
          }}
        >
          {e.actual === 0 ? "T" : e.won ? "W" : "L"}
        </span>
      ) : (
        <span className="w-4 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className="shrink-0 text-[11px]"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            {e.isHome || e.game.neutral_site ? "vs" : "at"}
          </span>
          <span className="truncate font-semibold">{e.opponent}</span>
          {e.opponentRank ? (
            <span
              className="shrink-0 text-[10.5px]"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              #{e.opponentRank}
            </span>
          ) : (
            <span
              className="chip shrink-0 !px-1 !text-[9.5px]"
              style={{
                background: "rgb(var(--surface-3))",
                color: "rgb(var(--text-faint))",
              }}
            >
              OOS
            </span>
          )}
        </div>
        {(e.expected !== null || diff !== null) && (
          <div
            className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px]"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            {e.expected !== null && <span>Exp {fmtSigned(e.expected, 0)}</span>}
            {e.actual !== null && <span>Act {fmtSigned(e.actual, 0)}</span>}
          </div>
        )}
      </div>

      {e.performance && diff !== null && (
        <PerformanceChip p={e.performance} diff={diff} />
      )}

      {e.played ? (
        <span className="w-[52px] shrink-0 text-right font-bold tnum">
          {e.teamScore}–{e.oppScore}
        </span>
      ) : (
        <span
          className="w-[52px] shrink-0 text-right text-[10.5px] uppercase"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          Upcoming
        </span>
      )}
    </div>
  );
}

function PerformanceChip({ p, diff }: { p: Performance; diff: number }) {
  const style: Record<Performance, { bg: string; fg: string }> = {
    dominant: { bg: "rgb(var(--good-soft))", fg: "rgb(var(--good))" },
    exceeded: { bg: "rgb(var(--good) / 0.1)", fg: "rgb(var(--good))" },
    "as-expected": {
      bg: "rgb(var(--surface-3))",
      fg: "rgb(var(--text-muted))",
    },
    below: { bg: "rgb(var(--bad-soft))", fg: "rgb(var(--bad))" },
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
      className="chip hidden shrink-0 sm:inline-flex"
      style={{ background: s.bg, color: s.fg }}
      title={PERFORMANCE_LABELS[p]}
    >
      {short[p]} ({fmtSigned(diff, 0)})
    </span>
  );
}
