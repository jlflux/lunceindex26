"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import Icon from "./Icon";
import StatPill from "./StatPill";
import type { ClassOdds, OddsReport, TeamOdds } from "@/lib/playoffs";
import { CLS_FILTER_ORDER, type Classification } from "@/lib/types";

/**
 * The odds board, grouped by region.
 *
 * Region is the right grouping for the same reason a division is in hockey:
 * it is the thing qualification actually runs on. Four teams out of each
 * region go, so each region gets its own block with a cut line ruled under
 * fourth place, and a reader can see who is above the line at a glance
 * instead of reconciling a flat list against a seed column.
 *
 * One classification at a time, because the columns genuinely differ between
 * them — a four-region class plays one round fewer than an eight-region class,
 * so a single table would either invent a round or drop one.
 */
export default function OddsBoard({ report }: { report: OddsReport }) {
  const available = useMemo(
    () =>
      CLS_FILTER_ORDER.filter((c) =>
        report.classes.some((x) => x.classification === c),
      ),
    [report],
  );
  const [cls, setCls] = useState<Classification>(available[0] ?? "6A");
  const [query, setQuery] = useState("");

  const block =
    report.classes.find((c) => c.classification === cls) ?? report.classes[0];
  if (!block) return null;

  return (
    <div className="space-y-4">
      <div
        className="flex flex-col gap-3 rounded-xl border px-3 py-3 lg:flex-row lg:items-center"
        style={{
          background: "rgb(var(--surface))",
          borderColor: "rgb(var(--border))",
        }}
      >
        <div className="relative lg:w-64">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            <Icon name="search" size={15} />
          </span>
          <input
            className="input !pl-9"
            type="search"
            placeholder="Search teams…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="table-scroll scroll-thin -mx-1 px-1">
          <div className="flex items-center gap-1.5">
            <span
              className="mr-1 shrink-0 text-[10.5px] font-bold uppercase tracking-wider"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              Class
            </span>
            {available.map((c) => (
              <button
                key={c}
                onClick={() => setCls(c)}
                className={`pill ${cls === c ? "pill-active" : ""}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <span
          className="ml-auto shrink-0 text-xs tnum"
          style={{ color: "rgb(var(--text-muted))" }}
        >
          {block.regions} regions · top {block.qualifiers} in each qualify
        </span>
      </div>

      <ClassTable block={block} query={query.trim().toLowerCase()} />
      <Legend block={block} />
    </div>
  );
}

/** True when the classification takes everybody — AA, as it stands. */
function everyoneQualifies(block: ClassOdds): boolean {
  return block.teams.every((t) => t.playoff === 1);
}

/** Every numeric column, so each can be scaled against its own range. */
function columnsOf(block: ClassOdds) {
  return [
    // A column of nothing but 100% says nothing. Where every team in the
    // classification is in the bracket, the question is seeding, not entry.
    ...(everyoneQualifies(block)
      ? []
      : [{ key: "playoff", label: "Playoffs", wide: true }]),
    ...Array.from({ length: block.qualifiers }, (_, i) => ({
      key: `seed${i}`,
      label: i === 0 ? "1 seed" : `${i + 1}`,
      wide: false,
    })),
    ...block.roundNames.map((n, i) => ({
      key: `round${i}`,
      label: shortRound(n),
      wide: false,
    })),
  ];
}

const valueOf = (t: TeamOdds, key: string): number => {
  if (key === "playoff") return t.playoff;
  if (key.startsWith("seed")) return t.seeds[Number(key.slice(4))] ?? 0;
  return t.rounds[Number(key.slice(5))] ?? 0;
};

function ClassTable({ block, query }: { block: ClassOdds; query: string }) {
  const cols = columnsOf(block);

  // Each column is scaled against its own best. A 12% title chance is the
  // strongest number in that column and should read that way, while 12% of
  // making the playoffs is close to hopeless — the same figure meaning
  // opposite things is exactly what a shared scale would hide.
  const peak = new Map<string, number>();
  for (const c of cols) {
    peak.set(
      c.key,
      Math.max(0.02, ...block.teams.map((t) => valueOf(t, c.key))),
    );
  }

  // Grouped from the full field first, so a team's position inside its region
  // and the cut line under fourth place stay true while a search narrows the
  // rows on screen. Filtering before grouping would renumber everything and
  // move the line to wherever the fourth match happened to be.
  const regions: { region: number; teams: TeamOdds[]; shown: TeamOdds[] }[] = [];
  for (const t of block.teams) {
    const last = regions[regions.length - 1];
    if (last && last.region === t.region) last.teams.push(t);
    else regions.push({ region: t.region, teams: [t], shown: [] });
  }
  for (const g of regions) {
    g.shown = query
      ? g.teams.filter((t) => t.name.toLowerCase().includes(query))
      : g.teams;
  }
  const visible = regions.filter((g) => g.shown.length);

  return (
    <div className="card table-scroll">
      <table className="w-full min-w-[880px] border-separate border-spacing-0">
        <thead>
          <tr style={{ background: "rgb(var(--surface-2))" }}>
            <Th className="w-[46px] !text-center">Rgn</Th>
            <Th className="!text-left">Team</Th>
            <Th className="!text-center" title="Region record so far">
              Reg W-L
            </Th>
            <Th
              className="!text-center"
              title="Where that record is heading, averaged over every simulated season"
            >
              Proj W-L
            </Th>
            {cols.map((c) => (
              <Th key={c.key} className="!text-center">
                {c.label}
              </Th>
            ))}
          </tr>
        </thead>
        {visible.map((g, gi) => (
          <Fragment key={g.region}>
            {/* Regions are separate competitions — four teams out of each go,
                and nothing about one bears on another. A rule alone was not
                enough to stop them reading as one long table. */}
            {gi > 0 && (
              <tbody aria-hidden>
                <tr>
                  <td
                    colSpan={4 + cols.length}
                    style={{ height: 14, background: "rgb(var(--canvas))" }}
                  />
                </tr>
              </tbody>
            )}
          <tbody>
            {g.shown.map((t, j) => {
              const i = g.teams.indexOf(t);
              // The line qualification is drawn at: under fourth place. Only
              // when the row below it is actually on screen.
              const cut =
                i + 1 === block.qualifiers &&
                j + 1 < g.shown.length &&
                g.teams.indexOf(g.shown[j + 1]) >= block.qualifiers;
              return (
                <tr
                  key={t.slug}
                  style={{ opacity: t.eliminated ? 0.5 : 1 }}
                >
                  {j === 0 && (
                    <td
                      rowSpan={g.shown.length}
                      className="px-1 text-center align-middle"
                      style={{
                        borderRight: "1px solid rgb(var(--border))",
                        background: "rgb(var(--surface-2))",
                      }}
                    >
                      <span
                        className="text-[12px] font-extrabold tracking-tight"
                        style={{ color: "rgb(var(--brand))" }}
                      >
                        R{g.region}
                      </span>
                    </td>
                  )}
                  <Td first={j === 0} cut={cut} className="!px-2.5 !text-left">
                    <span
                      className="mr-1.5 inline-block w-4 text-[11px] tnum"
                      style={{ color: "rgb(var(--text-faint))" }}
                    >
                      {i + 1}
                    </span>
                    <Link
                      href={`/team/${t.slug}`}
                      className="text-[13.5px] font-semibold hover:underline"
                    >
                      {t.name}
                    </Link>
                    {t.clinched && <Flag kind="x" />}
                    {t.eliminated && <Flag kind="e" />}
                  </Td>
                  <Td first={j === 0} cut={cut} className="!text-center">
                    <span
                      className="text-[12px] tnum"
                      style={{ color: "rgb(var(--text-muted))" }}
                    >
                      {t.region_w}-{t.region_l}
                    </span>
                  </Td>
                  <Td first={j === 0} cut={cut} className="!text-center">
                    <span className="text-[12px] font-semibold tnum">
                      {t.proj_w.toFixed(1)}-{t.proj_l.toFixed(1)}
                    </span>
                  </Td>
                  {cols.map((c) => (
                    <Td key={c.key} first={i === 0} cut={cut} className="!px-1">
                      <Pill
                        v={valueOf(t, c.key)}
                        peak={peak.get(c.key) as number}
                      />
                    </Td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          </Fragment>
        ))}
      </table>
    </div>
  );
}

function Th({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <th
      title={title}
      className={`sticky top-0 whitespace-nowrap border-b px-2 py-2 text-[10.5px] font-bold uppercase tracking-wider ${className}`}
      style={{
        borderColor: "rgb(var(--border))",
        background: "rgb(var(--surface-2))",
        color: "rgb(var(--text-muted))",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  first,
  cut,
}: {
  children: React.ReactNode;
  className?: string;
  /** First row of a region — takes the heavier rule that separates groups. */
  first?: boolean;
  /** Last qualifying row — takes the playoff cut line. */
  cut?: boolean;
}) {
  return (
    <td
      className={`px-2 py-1.5 ${className}`}
      style={{
        borderTop: first ? "1px solid rgb(var(--border-strong))" : undefined,
        borderBottom: cut
          ? "2px solid rgb(var(--brand) / 0.55)"
          : "1px solid rgb(var(--border) / 0.6)",
      }}
    >
      {children}
    </td>
  );
}

/**
 * A percentage as a filled pill, blue through to red.
 *
 * Diverging rather than a single hue, because the interesting reading is which
 * side of the middle a team is on. A one-hue ramp renders the whole bottom of
 * a sixty-team classification as the same near-empty wash, which is where most
 * of the teams are and where most of the questions are.
 */
function Pill({ v, peak }: { v: number; peak: number }) {
  const shown =
    v >= 0.9995 ? "100" : v <= 0 ? "0" : (v * 100).toFixed(v < 0.095 ? 1 : 0);
  const tail = <span className="text-[9px] opacity-60">%</span>;

  // Never happened in any season. Still the bad end of the scale, but flat —
  // at ten columns a wall of full-strength red is the first thing the eye
  // lands on, and "did not happen" is the least interesting cell there is.
  if (v <= 0) {
    return (
      <StatPill className="w-full !text-[12.5px] !py-1" strength={0} hot={false} empty>
        {shown}
        {tail}
      </StatPill>
    );
  }

  const t = Math.max(0, Math.min(1, v / peak));
  // Pulled apart at the bottom: most of a classification lives under a tenth
  // of the leader, and a linear ramp gives all of it the same colour.
  const k = Math.sqrt(t);
  return (
    <StatPill
      className="w-full !text-[12.5px] !py-1"
      hot={k >= 0.5}
      strength={Math.abs(k - 0.5) * 2}
    >
      {shown}
      {tail}
    </StatPill>
  );
}

function Flag({ kind }: { kind: "x" | "e" }) {
  return (
    <span
      className="ml-1.5 rounded px-1 py-0.5 text-[9.5px] font-bold uppercase"
      style={
        kind === "x"
          ? { background: "rgb(var(--good-soft))", color: "rgb(var(--good))" }
          : {
              background: "rgb(var(--surface-3))",
              color: "rgb(var(--text-faint))",
            }
      }
      title={
        kind === "x"
          ? "Clinched a playoff place — cannot be caught"
          : "Eliminated — cannot finish in its region's top four"
      }
    >
      {kind}
    </span>
  );
}

function Legend({ block }: { block: ClassOdds }) {
  const all = everyoneQualifies(block);
  return (
    <p
      className="text-xs leading-relaxed"
      style={{ color: "rgb(var(--text-faint))" }}
    >
      {all ? (
        <>
          Every team in Class {block.classification} reaches the bracket, so
          there is no line to draw and no playoff column to show — what the
          region table decides here is the seed, and the seed decides the draw.
        </>
      ) : (
        <>
          The rule under each region&rsquo;s {ordinalWord(block.qualifiers)}{" "}
          team is the playoff line — everyone above it qualifies as the region
          stands.{" "}
          <strong style={{ color: "rgb(var(--good))" }}>x</strong> clinched,{" "}
          <strong>e</strong> eliminated; both are proved from the games left to
          play rather than read off the simulation, so neither can be wrong.
        </>
      )}{" "}
      Each column is shaded against its own best, so the strongest title chance
      reads as strongly as the strongest playoff chance. Every figure is a
      share of ten thousand simulated seasons and carries about half a point of
      sampling noise.
    </p>
  );
}

const ordinalWord = (n: number) =>
  ({ 1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth" })[n] ??
  `${n}th`;

/** "Quarterfinals" does not fit a column head on a phone. */
function shortRound(n: string): string {
  return (
    {
      "First Round": "1st Rd",
      "Second Round": "2nd Rd",
      Quarterfinals: "Quarters",
      Semifinals: "Semis",
      Championship: "Title",
    }[n] ?? n
  );
}
