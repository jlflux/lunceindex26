"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") setTheme(stored);
    setMounted(true);
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

  // Cycles system → light → dark.
  const next: Theme =
    theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const icon = theme === "system" ? "monitor" : theme === "light" ? "sun" : "moon";
  const label = `Theme: ${theme}. Switch to ${next}.`;

  return (
    <button
      onClick={() => apply(next)}
      className="btn !h-9 !w-9 !p-0"
      title={label}
      aria-label={label}
      // Server renders the system icon; suppress the mismatch until hydrated.
      suppressHydrationWarning
    >
      <Icon name={mounted ? icon : "monitor"} size={16} />
    </button>
  );
}
