"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

/**
 * Theme switch. Dark is the default; the choice is stored in localStorage and
 * applied by an inline script in the document head before first paint, so the
 * page never flashes the wrong theme on load.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private browsing with storage disabled: the toggle still works for
      // this page view, it just will not be remembered.
    }
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="rounded-md border border-line p-2 text-ink2 hover:text-ink"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M10 2.5a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 10 2.5Zm0 13a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1a.75.75 0 0 1 .75-.75ZM17.5 10a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1 0-1.5h1a.75.75 0 0 1 .75.75Zm-13 0a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1 0-1.5h1A.75.75 0 0 1 4.5 10Zm10.8-5.3a.75.75 0 0 1 0 1.06l-.7.71a.75.75 0 0 1-1.07-1.06l.71-.71a.75.75 0 0 1 1.06 0ZM6.47 13.53a.75.75 0 0 1 0 1.06l-.71.71A.75.75 0 0 1 4.7 14.24l.7-.71a.75.75 0 0 1 1.07 0Zm8.83 1.77a.75.75 0 0 1-1.06 0l-.71-.7a.75.75 0 1 1 1.06-1.07l.71.71a.75.75 0 0 1 0 1.06ZM6.47 6.47a.75.75 0 0 1-1.06 0l-.71-.71A.75.75 0 0 1 5.76 4.7l.71.7a.75.75 0 0 1 0 1.07ZM10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M8.7 2.6a.75.75 0 0 0-.92-.95 7.5 7.5 0 1 0 9.57 9.57.75.75 0 0 0-.95-.92A6 6 0 0 1 8.7 2.6Z" />
        </svg>
      )}
    </button>
  );
}
