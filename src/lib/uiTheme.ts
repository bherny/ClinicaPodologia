export type UiTheme = "light" | "dark";

export const UI_THEME_STORAGE_KEY = "bodyfeet:ui-theme";

function systemTheme(): UiTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getUiTheme(): UiTheme {
  if (typeof window === "undefined") return "light";
  try {
    const saved = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // The system preference remains available when storage is restricted.
  }
  return systemTheme();
}

export function applyUiTheme(theme: UiTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function setUiTheme(theme: UiTheme) {
  try {
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, theme);
  } catch {
    // The active page can still use the selected theme without persistence.
  }
  applyUiTheme(theme);
}

export function initializeUiTheme() {
  const theme = getUiTheme();
  applyUiTheme(theme);
  return theme;
}
