import { describe, expect, it } from "vitest";
import {
  getMotivationalQuote,
  getMotivationalQuoteIndex,
  MOTIVATIONAL_QUOTES
} from "./motivationalQuotes";

describe("motivational quotes", () => {
  it("provides 400 unique phrases", () => {
    expect(MOTIVATIONAL_QUOTES).toHaveLength(400);
    expect(new Set(MOTIVATIONAL_QUOTES).size).toBe(400);
  });

  it("keeps the same phrase inside a four-hour Lima block", () => {
    const first = new Date("2026-08-27T13:05:00Z");
    const sameBlock = new Date("2026-08-27T16:59:00Z");
    expect(getMotivationalQuote(sameBlock)).toBe(getMotivationalQuote(first));
  });

  it("changes the phrase at the next four-hour Lima block", () => {
    const beforeBoundary = new Date("2026-08-27T16:59:00Z");
    const afterBoundary = new Date("2026-08-27T17:00:00Z");
    expect(getMotivationalQuoteIndex(afterBoundary)).toBe(getMotivationalQuoteIndex(beforeBoundary) + 1);
  });
});
