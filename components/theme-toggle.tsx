"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "scout-theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const root = document.documentElement;
    const stored = localStorage.getItem(STORAGE_KEY);
    const prefersDark = stored === "dark";
    root.classList.toggle("dark", prefersDark);
    setDark(prefersDark);
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    setDark(next);
  }

  if (!mounted) {
    return (
      <span
        className="inline-grid h-9 w-9 place-items-center rounded-lg border border-(--color-line)"
        aria-hidden
      />
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-grid h-9 w-9 place-items-center rounded-lg border border-(--color-line) text-(--color-fg-muted) transition hover:border-(--color-line-strong) hover:text-(--color-fg)"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
