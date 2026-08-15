import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRANCH_THEME,
  createBranchThemeStyle,
  isValidBranchColor,
  normalizeBranchTheme
} from "./branchTheme";

describe("branch themes", () => {
  it("normalizes valid colors and rejects malformed custom values", () => {
    expect(normalizeBranchTheme({ color_sidebar: "#abcdef" }).color_sidebar).toBe("#ABCDEF");
    expect(normalizeBranchTheme({ color_sidebar: "javascript:red" }).color_sidebar).toBe(DEFAULT_BRANCH_THEME.color_sidebar);
    expect(isValidBranchColor("#19A79C")).toBe(true);
    expect(isValidBranchColor("red")).toBe(false);
  });

  it("creates readable CSS variables for light and dark themes", () => {
    const dark = createBranchThemeStyle({ color_sidebar: "#0B455C", color_primario: "#19A79C" }) as Record<string, string>;
    const light = createBranchThemeStyle({ color_sidebar: "#FFFFFF", color_primario: "#FFFFFF" }) as Record<string, string>;

    expect(dark["--shell-on-navy"]).toBe("#FFFFFF");
    expect(light["--shell-on-navy"]).toBe("#173B51");
    expect(dark["--shell-teal-ring"]).toMatch(/^#[0-9A-F]{6}33$/);
  });
});
