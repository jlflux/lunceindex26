"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

const STORAGE_KEY = "alpreps-theme";

/**
 * Applies the stored theme before first paint.
 *
 * Dark is the default and lives in `:root`, so there is nothing to do unless
 * the visitor has explicitly chosen light. The OS preference is deliberately
 * not consulted — the toggle offers two states, not three.
 */
export function ThemeScript() {
  const js = `
    try {
      if (localStorage.getItem('${STORAGE_KEY}') === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    } catch (e) {}
  `;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(
      localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark",
    );
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    if (next === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }

  const label = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;

  return (
    <button
      onClick={toggle}
      className="btn !h-8 !w-8 !p-0"
      title={label}
      aria-label={label}
      suppressHydrationWarning
    >
      <Icon name={mounted && theme === "light" ? "sun" : "moon"} size={15} />
    </button>
  );
}
