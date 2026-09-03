/**
 * Theme handling.
 *
 * The toggle deliberately holds no React state. It reads and writes the class
 * on <html> directly, and both icons are always rendered with CSS deciding
 * which one is visible. That keeps the server-rendered markup identical to the
 * first client render, so there is no hydration mismatch and no flash of the
 * wrong theme.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "rg-theme";

/**
 * Runs before first paint, inlined into <head>. Kept small and dependency-free
 * on purpose — anything that throws here would leave the page unstyled.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}var e=document.documentElement;e.classList.toggle("dark",t==="dark");e.style.colorScheme=t;}catch(_){}})();`;

export function getTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.toggle("dark", theme === "dark");
  el.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). The theme
    // still applies for this session; it just will not be remembered.
  }
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
