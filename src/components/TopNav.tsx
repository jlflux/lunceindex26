"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import ThemeToggle from "./ThemeToggle";

/**
 * RPI and the explainer are intentionally absent: RPI is meaningless until a
 * few weeks of results exist, and the nav should carry only what is worth
 * looking at now. Both routes still work if linked directly.
 */
const LINKS = [
  { href: "/", label: "Power Index" },
  { href: "/teams", label: "Teams" },
  { href: "/schedule", label: "Schedule" },
] as const;

export default function TopNav({
  generated,
  season = "2026",
}: {
  generated?: string;
  season?: string;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname.startsWith("/team/")
      : pathname === href;

  return (
    <header
      className="border-b"
      style={{
        borderColor: "rgb(var(--border))",
        background:
          "linear-gradient(105deg, rgb(var(--hero-from)) 0%, rgb(var(--hero-to)) 62%)",
      }}
    >
      <div className="mx-auto max-w-[1400px] px-5 pt-5 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div>
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-[30px] font-extrabold leading-none tracking-tight text-white sm:text-[34px]">
                ALPREPS
              </span>
              <span
                className="text-[30px] font-extrabold leading-none tracking-tight sm:text-[34px]"
                style={{ color: "rgb(var(--brand))" }}
              >
                INDEX
              </span>
            </Link>
            <p
              className="mt-1.5 text-[12.5px] font-medium"
              style={{ color: "rgb(255 255 255 / 0.55)" }}
            >
              AHSAA Football Power Ratings · {season} Season
            </p>
          </div>

          <div className="flex items-center gap-3">
            {generated && (
              <span
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium"
                style={{
                  background: "rgb(255 255 255 / 0.07)",
                  color: "rgb(255 255 255 / 0.8)",
                }}
              >
                <Icon name="clock" size={13} />
                Updated{" "}
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

        {/* Three links always fit, so no scroll container — one was adding a
            stray horizontal scrollbar under the nav. */}
        <nav className="mt-4 flex items-center gap-7">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="relative whitespace-nowrap pb-2.5 text-[13.5px] font-semibold transition-colors"
              style={{
                color: isActive(l.href) ? "#fff" : "rgb(255 255 255 / 0.5)",
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
      </div>
    </header>
  );
}
