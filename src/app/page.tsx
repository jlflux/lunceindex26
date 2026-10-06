import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import Icon, { type IconName } from "@/components/Icon";
import TeamJump from "@/components/TeamJump";
import { fmt, record } from "@/lib/format";
import { loadHome, loadRatings } from "@/lib/data";
import { isExternal, type HomeItem, type HomeSection } from "@/lib/home-types";
import { CLS_ORDER } from "@/lib/types";

export const revalidate = 300;

/**
 * The front page.
 *
 * It used to be the Index board itself, which answered "who is best" and
 * nothing else — a 393-row table is a destination, not a way of reaching one,
 * and the site has ten of those now. So this orients instead: find your team,
 * then whatever the author has put in front.
 *
 * Everything on it is either typed in the admin (`loadHome`) or read off the
 * one published snapshot every other page reads (`loadRatings`). Nothing is
 * written twice: the top five here is the live board's top five, and the team
 * count in the intro is counted rather than typed.
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

  const [data, home] = await Promise.all([loadRatings(), loadHome()]);
  const published = data.ratings.length > 0;
  const top = [...data.ratings].sort((a, b) => a.rank - b.rank).slice(0, 5);
  const sections = home.sections.filter(
    (s) => s.shown && s.items.some((i) => i.shown),
  );

  return (
    <AppShell generated={published ? data.generated : undefined}>
      {home.banner.enabled && home.banner.text.trim() && (
        <div
          className="card mb-5 px-4 py-3 text-[13.5px] font-medium"
          style={{
            borderColor: "rgb(var(--brand) / 0.45)",
            background: "rgb(var(--brand) / 0.07)",
          }}
        >
          {home.banner.text}
        </div>
      )}

      <section className="mb-7">
        <h1 className="text-[27px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[33px]">
          {home.headline}
          {home.headlineAccent && (
            <>
              {home.headline ? " " : ""}
              <span style={{ color: "rgb(var(--brand))" }}>
                {home.headlineAccent}
              </span>
            </>
          )}
        </h1>
        {home.intro.trim() && (
          <p
            className="mt-2 max-w-[62ch] text-[14px] leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            {home.intro}
          </p>
        )}

        {home.showSearch && published && (
          <div className="mt-4 max-w-[560px]">
            <TeamJump teams={data.ratings} />
          </div>
        )}
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

      {/*
        The author's sections, in the author's order. A section whose items are
        all hidden is dropped above rather than rendered as a bare heading.
      */}
      {sections.map((section, i) => {
        // The top five sits beside the first "board" section, which is the
        // layout the page shipped with: a column of numbers against a column
        // of alternatives to them. Any other section runs full width.
        const pairWithTopFive =
          section.style === "board" &&
          home.showTopFive &&
          published &&
          sections.findIndex((s) => s.style === "board") === i;

        if (pairWithTopFive) {
          return (
            <section
              key={section.id}
              className="mb-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            >
              <TopFive
                label={home.topFiveLabel}
                teams={top}
                total={data.ratings.length}
              />
              <div>
                <SectionLabel>{section.label}</SectionLabel>
                <Items section={section} />
              </div>
            </section>
          );
        }

        return (
          <section key={section.id} className="mb-7">
            {section.label.trim() && <SectionLabel>{section.label}</SectionLabel>}
            <Items section={section} />
          </section>
        );
      })}

      {/* Nothing to pair it with, but it was asked for, so it still shows. */}
      {home.showTopFive &&
        published &&
        !sections.some((s) => s.style === "board") && (
          <section className="mb-7 lg:max-w-[560px]">
            <TopFive
              label={home.topFiveLabel}
              teams={top}
              total={data.ratings.length}
            />
          </section>
        )}
    </AppShell>
  );
}

function Items({ section }: { section: HomeSection }) {
  const items = section.items.filter((i) => i.shown);
  if (section.style === "card") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <Destination key={it.id} item={it} accent={i === 0} />
        ))}
      </div>
    );
  }
  if (section.style === "board") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <Board key={it.id} item={it} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <Chip key={it.id} item={it} />
      ))}
    </div>
  );
}

/**
 * One link, internal or out.
 *
 * An external link opens in a new tab and carries `rel="noreferrer"` — these
 * are author-entered addresses, and a page we do not control should not get a
 * handle on the window that opened it.
 */
function Anchor({
  href,
  className,
  style,
  children,
}: {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  if (isExternal(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={className}
        style={style}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} style={style}>
      {children}
    </Link>
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

function Destination({ item, accent }: { item: HomeItem; accent?: boolean }) {
  return (
    <Anchor
      href={item.href}
      className="card row-hover flex flex-col gap-1.5 p-4 transition-colors"
      style={{ borderColor: accent ? "rgb(var(--brand) / 0.45)" : undefined }}
    >
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
        style={{
          background: accent
            ? "rgb(var(--brand) / 0.14)"
            : "rgb(var(--surface-2))",
          color: accent ? "rgb(var(--brand))" : "rgb(var(--text-muted))",
        }}
      >
        <Icon name={item.icon as IconName} size={15} />
      </span>
      <span className="flex items-center gap-1.5 text-[14px] font-bold">
        {item.title}
        {isExternal(item.href) && <Icon name="external" size={11} />}
      </span>
      {item.body.trim() && (
        <span
          className="text-[12.5px] leading-relaxed"
          style={{ color: "rgb(var(--text-muted))" }}
        >
          {item.body}
        </span>
      )}
    </Anchor>
  );
}

function Board({ item }: { item: HomeItem }) {
  return (
    <Anchor
      href={item.href}
      className="card row-hover px-3.5 py-2.5 transition-colors"
    >
      <span className="flex items-center gap-1.5 text-[13px] font-bold">
        {item.title}
        {isExternal(item.href) && <Icon name="external" size={11} />}
      </span>
      {item.body.trim() && (
        <span
          className="block text-[12px] leading-snug"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          {item.body}
        </span>
      )}
    </Anchor>
  );
}

function Chip({ item }: { item: HomeItem }) {
  return (
    <Anchor href={item.href} className="btn !py-2 !text-[12.5px]">
      <Icon name={item.icon as IconName} size={13} />
      {item.title}
      {isExternal(item.href) && <Icon name="external" size={11} />}
    </Anchor>
  );
}

/** The live board's top five, never a copy of it. */
function TopFive({
  label,
  teams,
  total,
}: {
  label: string;
  teams: Awaited<ReturnType<typeof loadRatings>>["ratings"];
  total: number;
}) {
  return (
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
          {label}
        </span>
        <Link
          href="/ratings"
          className="text-[12px] font-semibold hover:underline"
          style={{ color: "rgb(var(--brand))" }}
        >
          All {total} teams →
        </Link>
      </div>
      <ol>
        {teams.map((t, i) => (
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
  );
}
