"use client";

import { usePathname } from "next/navigation";
import AdminNav from "./AdminNav";

/**
 * Admin chrome. The login page lives under /admin so it inherits this layout,
 * but must render bare — no nav, no sidebar offset.
 */
export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Both live under /admin but render bare — no nav, no sidebar offset.
  if (pathname === "/admin/login" || pathname === "/admin/setup") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <AdminNav />
      <div className="lg:pl-[228px]">
        <main className="px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-[1100px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Page title block for admin screens. */
export function AdminHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-extrabold tracking-tight">{title}</h1>
        {subtitle && (
          <p
            className="mt-1 max-w-2xl text-sm leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
