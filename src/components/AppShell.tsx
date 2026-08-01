import Link from "next/link";
import TopNav from "./TopNav";

/**
 * Public site chrome: a coloured masthead carrying the wordmark and nav, then
 * one wide content column. No sidebar — the ratings table wants the width.
 */
export default function AppShell({
  generated,
  children,
}: {
  generated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav generated={generated} />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 py-6 sm:px-8">
        {children}
      </main>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer
      className="mt-10 border-t"
      style={{ borderColor: "rgb(var(--border))" }}
    >
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-8">
        <p className="text-[12px]" style={{ color: "rgb(var(--text-faint))" }}>
          ALPreps Index · AHSAA Football · 2026
        </p>
        <Link
          href="/about"
          className="text-[12px] hover:underline"
          style={{ color: "rgb(var(--text-muted))" }}
        >
          How the ratings work
        </Link>
      </div>
    </footer>
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
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[24px] font-bold leading-tight sm:text-[27px]">
          {title}
        </h1>
        {subtitle && (
          <p
            className="mt-1.5 max-w-[68ch] text-[13.5px] leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
