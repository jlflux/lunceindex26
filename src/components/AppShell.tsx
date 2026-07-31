import { Suspense } from "react";
import Icon from "./Icon";
import Sidebar, { SidebarProvider, SidebarTrigger } from "./Sidebar";
import ThemeToggle from "./ThemeToggle";

/**
 * Public site chrome: fixed sidebar rail on desktop, drawer on mobile, and a
 * sticky top bar carrying the breadcrumb.
 */
export default function AppShell({
  breadcrumb,
  meta,
  children,
}: {
  breadcrumb: { label: string; href?: string }[];
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
    <div className="min-h-screen lg:pl-[248px]">
      {/* Outside the blurred bar — see the note in Sidebar.tsx. */}
      <Suspense>
        <Sidebar />
      </Suspense>

      <div
        className="sticky top-0 z-20 border-b backdrop-blur-md"
        style={{
          background: "rgb(var(--canvas) / 0.8)",
          borderColor: "rgb(var(--border))",
        }}
      >
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <SidebarTrigger />

          <nav
            className="flex min-w-0 items-center gap-1.5 text-[13px]"
            aria-label="Breadcrumb"
          >
            <Icon name="grid" size={15} className="shrink-0 opacity-40" />
            {breadcrumb.map((c, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && (
                  <Icon
                    name="chevron-right"
                    size={13}
                    className="shrink-0 opacity-35"
                  />
                )}
                <span
                  className="truncate"
                  style={{
                    color:
                      i === breadcrumb.length - 1
                        ? "rgb(var(--text))"
                        : "rgb(var(--text-muted))",
                    fontWeight: i === breadcrumb.length - 1 ? 650 : 500,
                  }}
                >
                  {c.label}
                </span>
              </span>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {meta && (
              <span
                className="hidden text-xs md:inline"
                style={{ color: "rgb(var(--text-faint))" }}
              >
                {meta}
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </div>

      <main className="px-4 py-6 sm:px-6 sm:py-7">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
    </div>
    </SidebarProvider>
  );
}

/** Page title block with optional right-hand actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">
          {title}
        </h1>
        {subtitle && (
          <p
            className="mt-1.5 max-w-2xl text-sm leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
