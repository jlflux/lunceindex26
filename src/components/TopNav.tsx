"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
      className="relative overflow-hidden border-b"
      style={{
        borderColor: "rgb(var(--border))",
        background:
          "linear-gradient(105deg, rgb(var(--hero-from)) 0%, rgb(var(--hero-to)) 62%)",
      }}
    >
      {/* Oversized wordmark bleeding off the right edge, as on the 2025 site. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 top-1/2 hidden -translate-y-1/2 select-none text-[86px] font-extrabold leading-none tracking-tighter md:block"
        style={{ color: "rgb(255 255 255 / 0.04)" }}
      >
        ALPREPS
      </span>

      <div className="relative mx-auto max-w-[1400px] px-5 pt-5 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
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
              <span
                className="text-[30px] font-extrabold leading-none sm:text-[34px]"
                style={{ color: "rgb(var(--brand))" }}
              >
                .
              </span>
            </Link>
            <p
              className="mt-1.5 text-[12.5px] font-medium"
              style={{ color: "rgb(255 255 255 / 0.55)" }}
            >
              AHSAA Football Power Ratings · {season} Season
              {generated && (
                <>
                  {" · Updated "}
                  {new Date(generated).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </>
              )}
            </p>
          </div>

          <ThemeToggle />
        </div>

        <nav className="table-scroll scroll-thin mt-4">
          <div className="flex items-center gap-7">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="relative whitespace-nowrap pb-2.5 text-[13.5px] font-semibold transition-colors"
                style={{
                  color: isActive(l.href)
                    ? "#fff"
                    : "rgb(255 255 255 / 0.5)",
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
          </div>
        </nav>
      </div>
    </header>
  );
}
