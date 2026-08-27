import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyUiTheme, getUiTheme, initializeUiTheme, setUiTheme, UI_THEME_STORAGE_KEY } from "./uiTheme";

describe("ui theme preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.removeProperty("color-scheme");
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  });

  it("uses the light theme by default", () => {
    expect(getUiTheme()).toBe("light");
  });

  it("uses the system preference when no choice was saved", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    expect(getUiTheme()).toBe("dark");
  });

  it("prioritizes and persists the selected theme", () => {
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, "dark");
    expect(initializeUiTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    setUiTheme("light");
    expect(window.localStorage.getItem(UI_THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("applies the browser color scheme", () => {
    applyUiTheme("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
