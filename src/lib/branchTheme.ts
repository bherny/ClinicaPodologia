import type { CSSProperties } from "react";

export type BranchThemeValues = {
  color_sidebar?: string | null;
  color_primario?: string | null;
  color_acento?: string | null;
};

export const DEFAULT_BRANCH_THEME = {
  color_sidebar: "#0B455C",
  color_primario: "#19A79C",
  color_acento: "#5E92DB"
} as const;

const HEX_COLOR = /^#[0-9A-F]{6}$/i;

function normalizeHex(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return HEX_COLOR.test(normalized) ? normalized : fallback;
}

function rgb(hex: string) {
  const value = hex.slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function toHex(value: number) {
  return Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0");
}

function mix(base: string, target: string, targetWeight: number) {
  const from = rgb(base);
  const to = rgb(target);
  const weight = Math.max(0, Math.min(1, targetWeight));
  return `#${toHex(from.r + (to.r - from.r) * weight)}${toHex(from.g + (to.g - from.g) * weight)}${toHex(from.b + (to.b - from.b) * weight)}`.toUpperCase();
}

function luminance(hex: string) {
  const color = rgb(hex);
  const channels = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function readableText(background: string) {
  return luminance(background) > 0.48 ? "#173B51" : "#FFFFFF";
}

export function normalizeBranchTheme(source?: BranchThemeValues | null) {
  return {
    color_sidebar: normalizeHex(source?.color_sidebar, DEFAULT_BRANCH_THEME.color_sidebar),
    color_primario: normalizeHex(source?.color_primario, DEFAULT_BRANCH_THEME.color_primario),
    color_acento: normalizeHex(source?.color_acento, DEFAULT_BRANCH_THEME.color_acento)
  };
}

export function isValidBranchColor(value: string) {
  return HEX_COLOR.test(value.trim());
}

export function createBranchThemeStyle(source?: BranchThemeValues | null): CSSProperties {
  const theme = normalizeBranchTheme(source);
  const sidebarText = readableText(theme.color_sidebar);
  const primaryText = readableText(theme.color_primario);

  return {
    "--shell-navy": theme.color_sidebar,
    "--shell-navy-deep": mix(theme.color_sidebar, "#000000", 0.16),
    "--shell-on-navy": sidebarText,
    "--shell-nav-muted": mix(sidebarText, theme.color_sidebar, 0.22),
    "--shell-nav-hover": mix(theme.color_sidebar, sidebarText, 0.1),
    "--shell-nav-active": mix(theme.color_sidebar, theme.color_acento, 0.3),
    "--shell-teal": theme.color_primario,
    "--shell-teal-hover": mix(theme.color_primario, "#000000", 0.14),
    "--shell-teal-soft": mix(theme.color_primario, "#FFFFFF", 0.88),
    "--shell-teal-ring": `${theme.color_primario}33`,
    "--shell-on-teal": primaryText,
    "--shell-accent": theme.color_acento,
    "--shell-accent-soft": mix(theme.color_acento, "#FFFFFF", 0.86)
  } as CSSProperties;
}