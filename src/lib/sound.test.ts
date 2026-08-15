import { beforeEach, describe, expect, it } from "vitest";
import {
  isUiSoundEnabled,
  playUiSound,
  prepareLoginChime,
  setUiSoundEnabled
} from "./sound";

describe("ui sound preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("enables sounds by default", () => {
    expect(isUiSoundEnabled()).toBe(true);
  });

  it("persists the muted preference", () => {
    setUiSoundEnabled(false);
    expect(isUiSoundEnabled()).toBe(false);

    setUiSoundEnabled(true);
    expect(isUiSoundEnabled()).toBe(true);
  });

  it("does not fail when Web Audio is unavailable", () => {
    expect(() => playUiSound("success")).not.toThrow();
    expect(() => prepareLoginChime()(true)).not.toThrow();
  });
});