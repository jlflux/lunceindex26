"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import ThemeToggle from "./ThemeToggle";

/**
 * The nav splits by what a link answers, not by importance.
 *
 * The masthead row holds the five ways of ranking teams. They are alternatives
 * to each other — the Index says who is best, Résumé says who has earned it,
 * RPI says what the schedule alone implies, and Composite and ASWA say what
 * everyone else thinks — so they belong side by side where they can be read as
 * a set, and where disagreeing is visibly the point.
 *
 * The quieter bar underneath holds the pages that are not rankings at all:
 * records, fixtures, and the explanation. Sitting them in the same row as the
 * boards made eight links that all looked equivalent and none of which looked
 * like the main event.
 */
const RANKINGS = [
  { href: "/", label: "Power Index" },
  { href: "/resume", label: "Résumé" },
  { href: "/rpi", label: "RPI" },
  { href: "/composite", label: "Composite" },
  { href: "/aswa", label: "ASWA" },
] as const;

const PAGES = [
  { href: "/teams", label: "Standings" },
  { href: "/schedule", label: "Schedule" },
  { href: "/about", label: "How It Works" },
] as const;

export default function TopNav({
  generated,
  season = "2026",
}: {
  generated?: string;
  season?: string;
}) {
  const pathname = usePathname();
  // A team page is reached from the Index, so the Index stays lit underneath it.
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname.startsWith("/team/")
      : pathname === href;

  return (
    <>
      <header
        className="border-b"
        style={{
          borderColor: "rgb(var(--border))",
          background:
            "linear-gradient(105deg, rgb(var(--hero-from)) 0%, rgb(var(--hero-to)) 62%)",
        }}
      >
        {/* One row on desktop: wordmark, the boards, then the timestamp. The
            tall stacked masthead spent a third of the screen before a single
            team appeared, which is the wrong trade on a 393-row board. */}
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-1 px-5 sm:px-8">
          <Link
            href="/"
            className="flex shrink-0 items-baseline gap-1.5 py-3.5"
            title={`AHSAA Football Power Ratings · ${season} Season`}
          >
            <span className="text-[17px] font-extrabold leading-none tracking-[-0.03em] text-white">
              ALPREPS
            </span>
            <span
              className="text-[17px] font-extrabold leading-none tracking-[-0.03em]"
              style={{ color: "rgb(var(--brand))" }}
            >
              INDEX
            </span>
          </Link>

          {/* Deliberately wrapping rather than scrolling: a scroll container
              here added a stray horizontal scrollbar under the nav. Five links
              no longer fit on one phone-width line, so the gap tightens and the
              row is allowed to wrap onto as many lines as it needs. */}
          <nav className="order-3 flex w-full flex-wrap items-center gap-x-4 sm:order-none sm:w-auto sm:flex-nowrap sm:gap-x-6">
            {RANKINGS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="relative whitespace-nowrap py-3 text-[13.5px] transition-colors sm:py-[18px]"
                style={{
                  color: isActive(l.href) ? "#fff" : "rgb(255 255 255 / 0.5)",
                  fontWeight: isActive(l.href) ? 650 : 500,
                }}
              >
                {l.label}
                {isActive(l.href) && (
                  <span
                    className="absolute inset-x-0 -bottom-px h-[2.5px] rounded-t"
                    style={{ background: "rgb(var(--brand))" }}
                  />
                )}
              </Link>
            ))}
          </nav>

          {/* Sits beside the wordmark on a phone; the nav wraps beneath both. */}
          <div className="order-2 ml-auto flex items-center gap-2.5 py-2 sm:order-none">
            {generated && (
              <span
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold"
                style={{
                  background: "rgb(255 255 255 / 0.07)",
                  color: "rgb(255 255 255 / 0.78)",
                }}
              >
                <Icon name="clock" size={12} />
                {/* The word costs ~55px, which is the difference between this
                    sitting beside the wordmark on a phone and wrapping below. */}
                <span className="hidden sm:inline">Updated</span>
                {new Date(generated).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Lighter than the masthead on purpose: these are the supporting pages,
          and giving them the same weight as the boards is what made the single
          row read as eight equal things. */}
      <div
        className="border-b"
        style={{
          borderColor: "rgb(var(--border))",
          background: "rgb(var(--surface))",
        }}
      >
        <nav className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-5 px-5 sm:gap-x-7 sm:px-8">
          {PAGES.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="relative whitespace-nowrap py-2.5 text-[13px] transition-colors"
              style={{
                color: isActive(l.href)
                  ? "rgb(var(--text))"
                  : "rgb(var(--text-muted))",
                fontWeight: isActive(l.href) ? 650 : 500,
              }}
            >
              {l.label}
              {isActive(l.href) && (
                <span
                  className="absolute inset-x-0 -bottom-px h-[2px] rounded-t"
                  style={{ background: "rgb(var(--brand))" }}
                />
              )}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
