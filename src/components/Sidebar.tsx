"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useState } from "react";
import Icon, { type IconName } from "./Icon";
import { CLS_FILTER_ORDER } from "@/lib/types";

interface NavLink {
  href: string;
  label: string;
  icon: IconName;
}

const RANKINGS: NavLink[] = [
  { href: "/", label: "Power Index", icon: "trophy" },
  { href: "/rpi", label: "RPI", icon: "chart" },
];

const BROWSE: NavLink[] = [
  { href: "/teams", label: "All Teams", icon: "users" },
  { href: "/schedule", label: "Schedule", icon: "calendar" },
];

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const activeClass = params.get("class");

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" && !activeClass : pathname === href;

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="px-4 pb-3 pt-4">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5"
        >
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-[15px] font-extrabold"
            style={{
              background: "rgb(var(--brand))",
              color: "#fff",
            }}
          >
            A
          </span>
          <span className="text-[15px] font-extrabold tracking-tight">
            ALPreps
            <span style={{ color: "rgb(var(--brand))" }}> Index</span>
          </span>
        </Link>
      </div>

      <nav className="scroll-thin flex-1 overflow-y-auto px-2 pb-4">
        <div className="mb-5">
          <p className="nav-section">Rankings</p>
          <div className="space-y-0.5">
            {RANKINGS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={onNavigate}
                className={`nav-item ${isActive(l.href) ? "nav-item-active" : ""}`}
              >
                <Icon name={l.icon} size={16} />
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <p className="nav-section">Browse</p>
          <div className="space-y-0.5">
            {BROWSE.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={onNavigate}
                className={`nav-item ${isActive(l.href) ? "nav-item-active" : ""}`}
              >
                <Icon name={l.icon} size={16} />
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <p className="nav-section">Classification</p>
          <div className="space-y-0.5">
            {CLS_FILTER_ORDER.map((c) => (
              <Link
                key={c}
                href={`/?class=${c}`}
                onClick={onNavigate}
                className={`nav-item ${
                  activeClass === c && pathname === "/" ? "nav-item-active" : ""
                }`}
              >
                <span className={`chip cls-${c} !min-w-[34px] !px-1.5`}>{c}</span>
                <span className="text-[13px]">Class {c}</span>
              </Link>
            ))}
          </div>
        </div>
      </nav>

      <div
        className="border-t px-2 py-3"
        style={{ borderColor: "rgb(var(--border))" }}
      >
        <Link href="/about" onClick={onNavigate} className="nav-item">
          <Icon name="info" size={16} />
          How ratings work
        </Link>
      </div>
    </div>
  );
}

/**
 * The rail and the trigger are separate components sharing state through this
 * context, because they cannot live in the same place in the tree: the trigger
 * belongs in the top bar, but the top bar uses `backdrop-filter`, which makes
 * it a containing block for `position: fixed` — mounting the rail inside it
 * pins the sidebar to the header instead of the viewport.
 */
const SidebarCtx = createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SidebarCtx.Provider value={{ open, setOpen }}>
      {children}
    </SidebarCtx.Provider>
  );
}

/** Goes in the top bar. */
export function SidebarTrigger() {
  const { setOpen } = useContext(SidebarCtx);
  return (
    <button
      onClick={() => setOpen(true)}
      className="btn !h-9 !w-9 !p-0 lg:hidden"
      aria-label="Open navigation"
    >
      <Icon name="menu" size={18} />
    </button>
  );
}

/** Desktop rail plus the mobile drawer. Must not sit inside a blurred layer. */
export default function Sidebar() {
  const { open, setOpen } = useContext(SidebarCtx);

  return (
    <>
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r lg:block"
        style={{
          background: "rgb(var(--surface))",
          borderColor: "rgb(var(--border))",
        }}
      >
        <SidebarContent />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          />
          <div
            className="absolute inset-y-0 left-0 w-[264px] border-r"
            style={{
              background: "rgb(var(--surface))",
              borderColor: "rgb(var(--border))",
            }}
          >
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
