"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "alpreps-theme";

/**
 * Applies the stored theme before first paint. Without this the page renders
 * in the system theme and then flips, which reads as a flash of wrong colour.
 */
export function ThemeScript() {
  const js = `
    try {
      var t = localStorage.getItem('${STORAGE_KEY}');
      if (t === 'light' || t === 'dark') {
        document.documentElement.setAttribute('data-theme', t);
      }
    } catch (e) {}
  `;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

type Theme = "light" | "dark" | "system";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") setTheme(stored);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    if (next === "system") {
      localStorage.removeItem(STORAGE_KEY);
      document.documentElement.removeAttribute("data-theme");
    } else {
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.setAttribute("data-theme", next);
    }
  }

  // Cycles system → light → dark. The icon shows what you'd switch to.
  const next: Theme =
    theme === "system" ? "light" : theme === "light" ? "dark" : "system";

  const label =
    theme === "system"
      ? "Theme: system"
      : theme === "light"
        ? "Theme: light"
        : "Theme: dark";

  return (
    <button
      onClick={() => apply(next)}
      className="btn !px-2.5"
      title={`${label} — click for ${next}`}
      aria-label={`${label}. Switch to ${next}.`}
    >
      <span aria-hidden className="text-base leading-none">
        {theme === "system" ? "◐" : theme === "light" ? "☀" : "☾"}
      </span>
    </button>
  );
}
