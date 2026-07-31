"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

const LINKS = [
  ["/admin", "Dashboard"],
  ["/admin/games", "Games"],
  ["/admin/import", "Import"],
  ["/admin/formula", "Formula"],
  ["/admin/teams", "Teams"],
] as const;

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  // The login page shares this layout but must not show the nav.
  if (pathname === "/admin/login") return null;

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-md"
      style={{
        borderColor: "rgb(var(--border))",
        background: "rgb(var(--bg) / 0.85)",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex items-center gap-3 py-3">
          <Link href="/admin" className="text-base font-extrabold tracking-tight">
            ALPreps<span style={{ color: "rgb(var(--accent))" }}> Admin</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/"
              target="_blank"
              className="hidden text-xs font-medium hover:underline sm:inline"
              style={{ color: "rgb(var(--text-muted))" }}
            >
              View site ↗
            </Link>
            <ThemeToggle />
            <button onClick={signOut} className="btn !py-1.5 !text-xs">
              Sign out
            </button>
          </div>
        </div>

        <nav className="table-scroll -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1 pb-2">
            {LINKS.map(([href, label]) => {
              const active =
                href === "/admin" ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors"
                  style={
                    active
                      ? { background: "rgb(var(--accent))", color: "#fff" }
                      : {
                          background: "rgb(var(--surface-2))",
                          color: "rgb(var(--text-muted))",
                        }
                  }
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}
