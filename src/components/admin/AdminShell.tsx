"use client";

import { usePathname } from "next/navigation";
import AdminNav from "./AdminNav";

/**
 * Admin chrome. Login and setup live under /admin so they inherit this
 * layout, but must render bare — no nav.
 */
export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === "/admin/login" || pathname === "/admin/setup") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <AdminNav />
      <main className="mx-auto w-full max-w-[1160px] px-5 py-8 sm:px-7">
        {children}
      </main>
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[24px] font-bold leading-tight">{title}</h1>
        {subtitle && (
          <p
            className="mt-1.5 max-w-[62ch] text-[14px] leading-relaxed"
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
