import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import Icon, { type IconName } from "@/components/Icon";
import TeamJump from "@/components/TeamJump";
import { fmt, record } from "@/lib/format";
import { loadRatings } from "@/lib/data";
import { CLS_ORDER } from "@/lib/types";

export const revalidate = 300;

/**
 * The front page.
 *
 * It used to be the Index board itself, which answered "who is best" and
 * nothing else — a 393-row table is a destination, not a way of reaching one,
 * and the site has ten of those now. So this orients instead: find your team,
 * then the four things most people actually came for, then the five boards as
 * a set, because *disagreeing* is the point of having five.
 *
 * Everything here is read off the one published snapshot that every other page
 * reads, so the page cannot be out of step with the boards it links to. The
 * top five is the live board's top five, not a copy.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  // A link saved to a filtered board — `/?class=6A` — used to land on the
  // Index. It still should; the board just lives at a different address now.
  const { class: classParam } = await searchParams;
  if (classParam && classParam in CLS_ORDER) {
    redirect(`/ratings?class=${encodeURIComponent(classParam)}`);
  }

  const data = await loadRatings();
  const published = data.ratings.length > 0;
  const top = [...data.ratings].sort((a, b) => a.rank - b.rank).slice(0, 5);

  return (
    <AppShell generated={published ? data.generated : undefined}>
      {/* ---------------------------------------------------------- hero */}
      <section className="mb-7">
        <h1 className="text-[27px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[33px]">
          Alabama high school football,{" "}
          <span style={{ color: "rgb(var(--brand))" }}>ranked and measured</span>
        </h1>
        <p
          className="mt-2 max-w-[62ch] text-[14px] leading-relaxed"
          style={{ color: "rgb(var(--text-muted))" }}
        >
          Power ratings for all {data.ratings.length || 393} AHSAA teams, region
          standings, playoff odds and a bracket — rebuilt every time a score
          comes in.
        </p>

        <div className="mt-4 max-w-[560px]">
          <TeamJump teams={data.ratings} />
        </div>
      </section>

      {!published && (
        <div
          className="card mb-6 px-4 py-3 text-[13px]"
          style={{
            borderColor: "rgb(var(--warn) / 0.45)",
            background: "rgb(var(--warn-soft))",
          }}
        >
          No ratings published yet — publish from the admin dashboard and the
          boards below will fill in.
        </div>
      )}

      {/* -------------------------------------------------- what to open */}
      <section className="mb-7">
        <SectionLabel>Start here</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Destination
            href="/ratings"
            icon="trophy"
            title="Power Index"
            body="Every team rated and ranked, with strength of schedule behind it."
            accent
          />
          <Destination
            href="/teams"
            icon="list"
            title="Region Standings"
            body="Who is winning the region games that decide the playoff field."
          />
          <Destination
            href="/bracketology"
            icon="grid"
            title="Bracketology"
            body="The playoff field as it stands, region by region, laid out by hand."
          />
          <Destination
            href="/odds"
            icon="chart"
            title="Playoff Odds"
            body="Ten thousand simulated seasons: seeds, byes and how far each team goes."
          />
        </div>
      </section>

      {/* ------------------------------------------------- the top five */}
      {published && (
        <section className="mb-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="card overflow-hidden">
            <div
              className="flex items-center justify-between gap-3 border-b px-4 py-2.5"
              style={{
                borderColor: "rgb(var(--border))",
                background: "rgb(var(--surface-2))",
              }}
            >
              <span
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: "rgb(var(--text-faint))" }}
              >
                Top of the Index
              </span>
              <Link
                href="/ratings"
                className="text-[12px] font-semibold hover:underline"
                style={{ color: "rgb(var(--brand))" }}
              >
                All {data.ratings.length} teams →
              </Link>
            </div>
            <ol>
              {top.map((t, i) => (
                <li
                  key={t.slug}
                  style={{
                    borderTop: i ? "1px solid rgb(var(--border) / 0.6)" : undefined,
                  }}
                >
                  <Link
                    href={`/team/${t.slug}`}
                    className="row-hover flex items-center gap-3 px-4 py-2.5"
                  >
                    <span
                      className="w-5 shrink-0 text-[12px] font-bold tnum"
                      style={{ color: "rgb(var(--text-faint))" }}
                    >
                      {t.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                      {t.name}
                    </span>
                    <span className={`chip cls-${t.classification} shrink-0`}>
                      {t.classification}
                    </span>
                    <span
                      className="shrink-0 text-[12px] tnum"
                      style={{ color: "rgb(var(--text-muted))" }}
                    >
                      {record(t.wins, t.losses)}
                    </span>
                    <span
                      className="w-11 shrink-0 text-right text-[13px] font-bold tnum"
                      style={{ color: "rgb(var(--rating))" }}
                    >
                      {fmt(t.rating, 1)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>

          {/* The five boards, as a set. They are alternatives to one another,
              and the fact that they disagree is the reason to show them
              together rather than treating the Index as the answer. */}
          <div>
            <SectionLabel>Five ways to rank a team</SectionLabel>
            <div className="grid gap-2 sm:grid-cols-2">
              <Board href="/ratings" name="Power Index" says="Who is best right now" />
              <Board href="/resume" name="Résumé" says="Who has earned it" />
              <Board href="/rpi" name="RPI" says="What the schedule alone implies" />
              <Board href="/composite" name="Composite" says="Where the polls agree" />
              <Board href="/aswa" name="ASWA" says="The sportswriters' poll" />
              <Board
                href="/about"
                name="How it works"
                says="What each one measures, and why they differ"
                muted
              />
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------ the rest */}
      <section>
        <SectionLabel>Also here</SectionLabel>
        <div className="flex flex-wrap gap-2">
          <Chip href="/schedule" icon="calendar" label="Schedule & results" />
          <Chip href="/teams" icon="users" label="Every team" />
          <Chip href="/bracketology/about" icon="info" label="Reading the bracket" />
          <Chip href="/about" icon="info" label="How the Index works" />
        </div>
      </section>
    </AppShell>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-2.5 text-[11px] font-bold uppercase tracking-wider"
      style={{ color: "rgb(var(--text-faint))" }}
    >
      {children}
    </h2>
  );
}

/** One of the four cards people are most likely to want. */
function Destination({
  href,
  icon,
  title,
  body,
  accent,
}: {
  href: string;
  icon: IconName;
  title: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="card row-hover flex flex-col gap-1.5 p-4 transition-colors"
      style={{
        borderColor: accent ? "rgb(var(--brand) / 0.45)" : undefined,
      }}
    >
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
        style={{
          background: accent ? "rgb(var(--brand) / 0.14)" : "rgb(var(--surface-2))",
          color: accent ? "rgb(var(--brand))" : "rgb(var(--text-muted))",
        }}
      >
        <Icon name={icon} size={15} />
      </span>
      <span className="text-[14px] font-bold">{title}</span>
      <span
        className="text-[12.5px] leading-relaxed"
        style={{ color: "rgb(var(--text-muted))" }}
      >
        {body}
      </span>
    </Link>
  );
}

/** One of the five boards, with the question it answers. */
function Board({
  href,
  name,
  says,
  muted,
}: {
  href: string;
  name: string;
  says: string;
  muted?: boolean;
}) {
  return (
    <Link href={href} className="card row-hover px-3.5 py-2.5 transition-colors">
      <span
        className="block text-[13px] font-bold"
        style={{ color: muted ? "rgb(var(--text-muted))" : undefined }}
      >
        {name}
      </span>
      <span
        className="block text-[12px] leading-snug"
        style={{ color: "rgb(var(--text-faint))" }}
      >
        {says}
      </span>
    </Link>
  );
}

function Chip({
  href,
  icon,
  label,
}: {
  href: string;
  icon: IconName;
  label: string;
}) {
  return (
    <Link href={href} className="btn !py-2 !text-[12.5px]">
      <Icon name={icon} size={13} />
      {label}
    </Link>
  );
}
