import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

export default function SiteHeader({ generated }: { generated?: string }) {
  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-md"
      style={{
        borderColor: "rgb(var(--border))",
        background: "rgb(var(--bg) / 0.85)",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="text-lg font-extrabold tracking-tight">
            ALPreps
            <span style={{ color: "rgb(var(--accent))" }}> Index</span>
          </span>
          <span
            className="hidden text-xs font-medium sm:inline"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            AHSAA Football · 2026
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {generated && (
            <span
              className="hidden text-xs md:inline"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              Updated{" "}
              {new Date(generated).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
