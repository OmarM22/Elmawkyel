"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const THEME_EVENT = "alwakeel:theme-change";

function getSnapshot(): "light" | "dark" {
  if (document.documentElement.classList.contains("light")) {
    return "light";
  }
  return "dark";
}

function getServerSnapshot(): "light" | "dark" {
  return "dark";
}

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

function setTheme(next: "light" | "dark") {
  document.documentElement.classList.toggle("light", next === "light");
  document.documentElement.classList.toggle("dark", next === "dark");
  try {
    localStorage.setItem("alwakeel-theme", next);
  } catch {
    /* storage unavailable (private mode) — session-only switch is fine */
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * Light/dark theme toggle. Drives the `.light` / `.dark` classes on <html>
 * (compiled by the root-layout inline script) and persists the choice to
 * localStorage under the "alwakeel-theme" key.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className={className}
      aria-label={theme === "light" ? "التبديل إلى الوضع الداكن" : "التبديل إلى الوضع الفاتح"}
      title={theme === "light" ? "الوضع الداكن" : "الوضع الفاتح"}
    >
      {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}