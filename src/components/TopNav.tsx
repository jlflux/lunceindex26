"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Power Index" },
  { href: "/rpi", label: "RPI" },
  { href: "/teams", label: "Teams" },
  { href: "/schedule", label: "Schedule" },
  { href: "/about", label: "How it works" },
] as const;

export default function TopNav({ generated }: { generated?: string }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/team/") : pathname === href;

  return (
    <header
      className="sticky top-0 z-30 border-b"
      style={{
        background: "rgb(var(--surface))",
        borderColor: "rgb(var(--border))",
      }}
    >
      <div className="mx-auto max-w-[1240px] px-5 sm:px-7">
        <div className="flex h-[58px] items-center gap-6">
          <Link href="/" className="flex shrink-0 items-baseline gap-[7px]">
            <span className="text-[17px] font-bold tracking-tight">
              ALPreps
            </span>
            <span
              className="text-[17px] font-bold tracking-tight"
              style={{ color: "rgb(var(--brand))" }}
            >
              Index
            </span>
          </Link>

          {/* Tabs scroll horizontally on narrow screens rather than wrapping
              or collapsing into a menu — five items stay reachable. */}
          <nav className="table-scroll scroll-thin -mb-px min-w-0 flex-1">
            <div className="flex h-[57px] items-center gap-6">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`tab ${isActive(l.href) ? "tab-active" : ""}`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            {generated && (
              <span
                className="hidden text-xs lg:inline"
                style={{ color: "rgb(var(--text-faint))" }}
              >
                Updated{" "}
                {new Date(generated).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer
      className="mt-14 border-t"
      style={{ borderColor: "rgb(var(--border))" }}
    >
      <div className="mx-auto max-w-[1240px] px-5 py-7 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-[6px]">
            <span className="text-sm font-bold tracking-tight">ALPreps</span>
            <span
              className="text-sm font-bold tracking-tight"
              style={{ color: "rgb(var(--brand))" }}
            >
              Index
            </span>
            <span
              className="ml-2 text-xs"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              AHSAA Football · 2026
            </span>
          </div>
          <Link
            href="/about"
            className="inline-flex items-center gap-1.5 text-xs hover:underline"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            <Icon name="info" size={13} />
            How the ratings work
          </Link>
        </div>
      </div>
    </footer>
  );
}
