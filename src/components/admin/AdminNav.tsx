"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import ThemeToggle from "@/components/ThemeToggle";

const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Dashboard", icon: "grid" },
  { href: "/admin/games", label: "Games", icon: "list" },
  { href: "/admin/import", label: "Import", icon: "upload" },
  { href: "/admin/formula", label: "Formula", icon: "sliders" },
  { href: "/admin/teams", label: "Teams", icon: "users" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="space-y-0.5">
      {LINKS.map((l) => {
        const active =
          l.href === "/admin" ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={onNavigate}
            className={`nav-item ${active ? "nav-item-active" : ""}`}
          >
            <Icon name={l.icon} size={16} />
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-4">
        <Link href="/admin" onClick={onNavigate} className="flex items-center gap-2.5">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]"
            style={{
              background: "rgb(var(--primary))",
              color: "rgb(var(--primary-fg))",
            }}
          >
            <Icon name="shield" size={16} />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight">
            ALPreps
            <span style={{ color: "rgb(var(--text-faint))" }}> Admin</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-2">
        <p className="nav-section">Manage</p>
        <NavLinks onNavigate={onNavigate} />
      </nav>

      <div
        className="space-y-0.5 border-t px-2 py-3"
        style={{ borderColor: "rgb(var(--border))" }}
      >
        <Link href="/" target="_blank" className="nav-item">
          <Icon name="external" size={16} />
          View public site
        </Link>
        <button onClick={signOut} className="nav-item w-full">
          <Icon name="logout" size={16} />
          Sign out
        </button>
      </div>
    </div>
  );
}

const TITLES: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/games": "Games",
  "/admin/import": "Import",
  "/admin/formula": "Formula",
  "/admin/teams": "Teams",
};

export default function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const breadcrumb = TITLES[pathname];

  return (
    <>
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[228px] border-r lg:block"
        style={{
          background: "rgb(var(--surface))",
          borderColor: "rgb(var(--border))",
        }}
      >
        <SidebarBody />
      </aside>

      <div
        className="sticky top-0 z-20 border-b backdrop-blur-md lg:pl-[228px]"
        style={{
          background: "rgb(var(--canvas) / 0.8)",
          borderColor: "rgb(var(--border))",
        }}
      >
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <button
            onClick={() => setOpen(true)}
            className="btn !h-9 !w-9 !p-0 lg:hidden"
            aria-label="Open navigation"
          >
            <Icon name="menu" size={18} />
          </button>

          <nav
            className="flex items-center gap-1.5 text-[13px]"
            aria-label="Breadcrumb"
          >
            <span style={{ color: "rgb(var(--text-muted))" }}>Admin</span>
            {breadcrumb && (
              <>
                <Icon
                  name="chevron-right"
                  size={13}
                  className="opacity-35"
                />
                <span className="font-semibold">{breadcrumb}</span>
              </>
            )}
          </nav>

          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          />
          <div
            className="absolute inset-y-0 left-0 w-[252px] border-r"
            style={{
              background: "rgb(var(--surface))",
              borderColor: "rgb(var(--border))",
            }}
          >
            <SidebarBody onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
