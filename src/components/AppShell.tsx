import Link from "next/link";
import Icon from "./Icon";
import TopNav from "./TopNav";

/**
 * Public site chrome: a colored masthead carrying the wordmark and nav, then
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
          How the ALPreps Index works
        </Link>
      </div>
    </footer>
  );
}

/** Page title block with optional right-hand actions. */
export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** Sits under the subtitle — used by the hand-entered boards for their date. */
  meta?: React.ReactNode;
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
        {meta && <div className="mt-2.5">{meta}</div>}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/**
 * "Updated Mon, Sep 14 · 6:08 PM" for a board that keeps its own schedule.
 *
 * Deliberately not the masthead chip: that one says when the Index last
 * recomputed, and these boards are typed in by hand on their own days. Given
 * one of the questions this answers is "has this week's poll landed yet", the
 * label names the board rather than saying a bare "Updated".
 */
export function UpdatedStamp({
  label,
  when,
}: {
  label: string;
  when: string | null;
}) {
  if (!when) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold"
      style={{
        background: "rgb(var(--surface-2))",
        color: "rgb(var(--text-muted))",
        border: "1px solid rgb(var(--border))",
      }}
    >
      <Icon name="clock" size={12} />
      {label} {when}
    </span>
  );
}
