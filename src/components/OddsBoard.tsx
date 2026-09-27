"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import Icon from "./Icon";
import StatPill from "./StatPill";
import type { ClassOdds, OddsReport, TeamOdds } from "@/lib/playoffs";
import { magnitude, polarity } from "@/lib/shade";
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

/**
 * True when the classification takes everybody — AA, as it stands.
 *
 * Barred teams are not counted. They sit at 0% by definition, and one of them
 * would otherwise make it look as though AA had become a qualifying question
 * when for every team that can actually enter it is still a seeding one.
 */
function everyoneQualifies(block: ClassOdds): boolean {
  const eligible = block.teams.filter((t) => !t.ineligible);
  return eligible.length > 0 && eligible.every((t) => t.playoff === 1);
}

/**
 * How a column's colour is allowed to behave.
 *
 * `polarity` is a two-sided scale around a line the team is on one side of.
 * `magnitude` is one-sided: more of the number is more colour, and none of it
 * is no colour. Which one a column takes is not a matter of taste — it is a
 * question about whether the column has a wrong answer, and only one of them
 * does. See `Pill`.
 */
type Scale = "polarity" | "magnitude";

/** Every numeric column, with the kind of scale its question deserves. */
function columnsOf(block: ClassOdds): {
  key: string;
  label: string;
  scale: Scale;
}[] {
  return [
    // A column of nothing but 100% says nothing. Where every team in the
    // classification is in the bracket, the question is seeding, not entry.
    ...(everyoneQualifies(block)
      ? []
      : [{ key: "playoff", label: "Playoffs", scale: "polarity" as Scale }]),
    ...Array.from({ length: block.qualifiers }, (_, i) => ({
      key: `seed${i}`,
      label: i === 0 ? "1 seed" : `${i + 1}`,
      scale: "magnitude" as Scale,
    })),
    ...block.roundNames.map((n, i) => ({
      key: `round${i}`,
      label: shortRound(n),
      scale: "magnitude" as Scale,
    })),
  ];
}

/**
 * Whether a column's extreme is a fact about this team rather than a count of
 * trials.
 *
 * Qualifying has a proof either way — clinched and eliminated both come from
 * what the games left to play make arithmetically possible. A seed becomes a
 * fact once the region has no games left. Winning a round never does: the
 * bracket is played out by the same weighted coins as everything else, so
 * even the best team in the state only ever reaches ">99".
 */
const isCertain = (t: TeamOdds, key: string): boolean => {
  if (key === "playoff") return t.clinched || t.eliminated;
  if (key.startsWith("seed")) return t.settled;
  return false;
};

const valueOf = (t: TeamOdds, key: string): number => {
  if (key === "playoff") return t.playoff;
  if (key.startsWith("seed")) return t.seeds[Number(key.slice(4))] ?? 0;
  return t.rounds[Number(key.slice(5))] ?? 0;
};

function ClassTable({ block, query }: { block: ClassOdds; query: string }) {
  const cols = columnsOf(block);

  // Each magnitude column is scaled against its own best. A 12% title chance
  // is the strongest number in that column and should read that way, while 12%
  // of making the playoffs is close to hopeless — the same figure meaning
  // opposite things is exactly what a shared scale would hide. The playoff
  // column needs no peak: it is measured against an even chance, which is a
  // fixed thing.
  const peak = new Map<string, number>();
  for (const c of cols) {
    if (c.scale !== "magnitude") continue;
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
              // Barred teams are sorted to the end of their region and can
              // take no place, so they sit outside the numbering and outside
              // the count the cut line is drawn against.
              const eligible = g.teams.filter((x) => !x.ineligible);
              const i = eligible.indexOf(t);
              const below = g.shown[j + 1];
              // The line qualification is drawn at: under fourth place. Only
              // when the row below it is actually on screen.
              const cut =
                !t.ineligible &&
                i + 1 === block.qualifiers &&
                j + 1 < g.shown.length &&
                (below.ineligible ||
                  eligible.indexOf(below) >= block.qualifiers);
              return (
                <tr
                  key={t.slug}
                  style={{
                    opacity: t.eliminated || t.ineligible ? 0.5 : 1,
                  }}
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
                      {t.ineligible ? "—" : i + 1}
                    </span>
                    <Link
                      href={`/team/${t.slug}`}
                      className="text-[13.5px] font-semibold hover:underline"
                    >
                      {t.name}
                    </Link>
                    {t.clinched && <Flag kind="x" />}
                    {t.eliminated && <Flag kind="e" />}
                    {t.ineligible && <Flag kind="i" />}
                  </Td>
                  <Td first={j === 0} cut={cut} className="!text-center">
                    <span
                      className="text-[12px] tnum"
                      style={{ color: "rgb(var(--text-muted))" }}
                    >
                      {t.ineligible
                        ? "—"
                        : `${t.region_w}-${t.region_l}${t.region_t ? `-${t.region_t}` : ""}`}
                    </span>
                  </Td>
                  <Td first={j === 0} cut={cut} className="!text-center">
                    <span className="text-[12px] font-semibold tnum">
                      {t.ineligible
                        ? "—"
                        : `${t.proj_w.toFixed(1)}-${t.proj_l.toFixed(1)}`}
                    </span>
                  </Td>
                  {cols.map((c) => (
                    <Td key={c.key} first={j === 0} cut={cut} className="!px-1">
                      <Pill
                        v={valueOf(t, c.key)}
                        scale={c.scale}
                        peak={peak.get(c.key)}
                        certain={isCertain(t, c.key)}
                        blank={t.ineligible}
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
 * The text in a cell.
 *
 * 100 and 0 are claims, not roundings. Every other figure is rounded to fit,
 * and at the top of the range that rounding used to manufacture them: 99.6%
 * came out as "100" by way of toFixed, which walked straight past the
 * certainty check and told a team it was through when the simulation had
 * found seasons where it was not. The reported symptom was a team at 99.6%
 * reading 100% while a team at a true 100.0% read ">99%" beside it.
 *
 * So the top and bottom bands keep a decimal place. Nothing that is not at
 * the extreme is allowed to print like it is.
 */
function label(v: number, certain?: boolean): string {
  if (v >= 0.9995) return certain ? "100" : ">99";
  if (v <= 0.0005) return certain ? "0" : "<1";
  if (v >= 0.995 || v < 0.095) return (v * 100).toFixed(1);
  return (v * 100).toFixed(0);
}

/**
 * A percentage as a filled pill.
 *
 * The colour has one job, and it is not "show the number again" — the number is
 * already there in the cell. It is to make the cells worth looking at louder
 * than the cells that are not. Which means the whole question is: in this
 * column, what counts as worth looking at?
 *
 * Two answers, and a column gets one or the other.
 *
 * **Qualifying has a wrong side.** There is a line under the fourth team and a
 * team is above it or below it, so the column reads as polarity: blue above an
 * even chance, red below it, and the further from even the more of it. Red here
 * means what red should mean — in trouble. It is measured against a flat 50%
 * rather than against the best team in the column, because an even chance to
 * qualify means the same thing in every region in the state.
 *
 * **Everything else is one-sided.** A team is not on the wrong side of the
 * championship. Nobody is *in trouble* in the title column; there is no line to
 * be under. So those columns read as magnitude — one hue, and more of the
 * number is more of it. A team with no chance gets no colour, which is correct,
 * because that is the least interesting cell on the board and there are
 * hundreds of them.
 *
 * Both columns used to be the two-sided one, and it inverted the board. The
 * arms of a diverging scale are strongest at *both* ends, so 0.1% to win the
 * title — a fact about forty of the forty-eight teams in a classification, and
 * news about none of them — came out as the loudest cell on the page, while a
 * genuine 9.4% contender sat a shade off blank. That was the reported symptom.
 * The cause was using a two-sided scale on a quantity with only one side.
 *
 * `certain` decides whether the extremes may be printed flat. Ten thousand
 * seasons out of ten thousand is not the same claim as "cannot fail", and a
 * team that could still play its way out should not be told it is through —
 * so without a proof the ends read ">99" and "<1" rather than 100 and 0.
 */
function Pill({
  v,
  scale,
  peak,
  certain,
  blank,
}: {
  v: number;
  scale: Scale;
  /** The column's best, for a magnitude column. Unused by a polarity one. */
  peak?: number;
  /** Settled by arithmetic, not merely by every trial agreeing. */
  certain?: boolean;
  /** The question does not apply to this team at all. */
  blank?: boolean;
}) {
  const shown = label(v, certain);
  const tail = <span className="text-[9px] opacity-60">%</span>;
  const cls = "w-full !text-[12.5px] !py-1";

  // A team barred from the postseason is not at 0% the way a team that played
  // its way out is. Nought per cent is an outcome; this is the absence of a
  // question, and a row of zeroes would read as the former.
  if (blank) {
    return (
      <StatPill className={cls} strength={0} hot empty>
        &mdash;
      </StatPill>
    );
  }

  // Never happened in any season, in a column where that is simply the absence
  // of a chance rather than a bad outcome. Flat: the distinction between 0.0%
  // and 0.1% is not one the eye should be asked to make, and neither is worth a
  // drop of ink. The polarity column keeps its colour at zero, because there
  // nought per cent is the news.
  if (scale === "magnitude" && v <= 0.0005) {
    return (
      <StatPill className={cls} strength={0} hot empty>
        {shown}
        {tail}
      </StatPill>
    );
  }

  // No `empty` at a polarity midpoint: the pill already fades to a 12% tint of
  // its hue there, neutral enough that a 49% and a 51% read alike — as they
  // should, being the same news. Painting it `empty` would also drop the text
  // to the faint ink reserved for a team with no games played, and an even
  // chance to qualify is the most interesting cell in the column, not the least.
  const { hot, strength } =
    scale === "polarity" ? polarity(v) : magnitude(v, peak ?? 1);

  return (
    <StatPill className={cls} hot={hot} strength={strength}>
      {shown}
      {tail}
    </StatPill>
  );
}

const FLAGS = {
  x: {
    tone: { background: "rgb(var(--good-soft))", color: "rgb(var(--good))" },
    title: "Clinched a playoff place — cannot be caught",
  },
  e: {
    tone: {
      background: "rgb(var(--surface-3))",
      color: "rgb(var(--text-faint))",
    },
    title: "Eliminated — cannot finish high enough in its region",
  },
  i: {
    tone: { background: "rgb(var(--warn-soft))", color: "rgb(var(--warn))" },
    title:
      "Barred from the postseason — its region games counted for neither side",
  },
} as const;

function Flag({ kind }: { kind: keyof typeof FLAGS }) {
  return (
    <span
      className="ml-1.5 rounded px-1 py-0.5 text-[9.5px] font-bold uppercase"
      style={FLAGS[kind].tone}
      title={FLAGS[kind].title}
    >
      {kind}
    </span>
  );
}

function Legend({ block }: { block: ClassOdds }) {
  const all = everyoneQualifies(block);
  const barred = block.teams.filter((t) => t.ineligible);
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
      {barred.length > 0 && (
        <>
          <strong style={{ color: "rgb(var(--warn))" }}>i</strong>{" "}
          {barred.map((t) => t.name).join(" and ")}{" "}
          {barred.length > 1 ? "are" : "is"} barred from the postseason, so{" "}
          {barred.length > 1 ? "their" : "its"} region games count for neither
          side &mdash; {barred.length > 1 ? "they read" : "it reads"} 0-0 and{" "}
          {barred.length > 1 ? "their" : "its"} opponents took an overall result
          and no region one. The rating is untouched; the football happened.{" "}
        </>
      )}
      {!all && (
        <>
          The playoff column is the only one with a wrong side, so it is the
          only one that turns red:{" "}
          <strong style={{ color: "rgb(var(--odds-hi))" }}>blue</strong> above
          an even chance of qualifying,{" "}
          <strong style={{ color: "rgb(var(--odds-lo))" }}>red</strong> below
          it.{" "}
        </>
      )}
      Seeds and rounds only shade one way, since no team is on the wrong side of
      a championship — more blue is a better chance, and a team without one
      stays blank. Those columns are each shaded against their own best, so the
      strongest title chance reads as strongly as the strongest shot at a seed.
      Every figure is a share of ten thousand simulated seasons and carries
      about half a point of sampling noise.
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
