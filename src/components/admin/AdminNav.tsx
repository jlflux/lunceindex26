"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import ThemeToggle from "@/components/ThemeToggle";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/games", label: "Games" },
  { href: "/admin/import", label: "Import" },
  { href: "/admin/formula", label: "Formula" },
  { href: "/admin/teams", label: "Teams" },
] as const;

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href);

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <header
      className="sticky top-0 z-30 border-b"
      style={{
        background: "rgb(var(--surface))",
        borderColor: "rgb(var(--border))",
      }}
    >
      <div className="mx-auto max-w-[1160px] px-5 sm:px-7">
        <div className="flex h-[58px] items-center gap-6">
          <Link href="/admin" className="flex shrink-0 items-baseline gap-[7px]">
            <span className="text-[17px] font-bold tracking-tight">ALPreps</span>
            <span
              className="text-[17px] font-bold tracking-tight"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              Admin
            </span>
          </Link>

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

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/"
              target="_blank"
              className="hidden items-center gap-1.5 text-xs hover:underline sm:inline-flex"
              style={{ color: "rgb(var(--text-muted))" }}
            >
              View site
              <Icon name="external" size={12} />
            </Link>
            <ThemeToggle />
            <button onClick={signOut} className="btn !py-1.5 !text-xs">
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
