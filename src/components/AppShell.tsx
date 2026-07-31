import TopNav, { Footer } from "./TopNav";

/**
 * Public site chrome: a sticky top bar and one centred content column.
 * No sidebar — five destinations do not need a rail, and the extra column
 * was costing horizontal room the ratings table actually wants.
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
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-5 py-8 sm:px-7 sm:py-10">
        {children}
      </main>
      <Footer />
    </div>
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
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[27px] font-bold leading-[1.15] sm:text-[32px]">
          {title}
        </h1>
        {subtitle && (
          <p
            className="mt-2 max-w-[62ch] text-[14px] leading-relaxed"
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
