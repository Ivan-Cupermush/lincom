//! Переключение тем Solarized Light / Dark.

export type ThemeName = "light" | "dark";

const KEY = "lincom.theme";

export function currentTheme(): ThemeName {
  return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(KEY, theme);
}

export function toggleTheme(): ThemeName {
  const next: ThemeName = currentTheme() === "light" ? "dark" : "light";
  applyTheme(next);
  return next;
}
