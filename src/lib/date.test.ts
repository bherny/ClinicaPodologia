import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addMinutesToTime,
  dateTimeWithinHours,
  isToday,
  isTomorrow,
  startOfTodayISO,
  todayISO,
  tomorrowISO,
  toReadableDate,
  toReadableDateLong,
  toReadableTime
} from "./date";

describe("date helpers in America/Lima", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps the local clinical date after midnight UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T04:30:00.000Z"));

    expect(todayISO()).toBe("2026-08-15");
    expect(tomorrowISO()).toBe("2026-08-16");
    expect(isToday("2026-08-15")).toBe(true);
    expect(isTomorrow("2026-08-16")).toBe(true);
    expect(startOfTodayISO()).toBe("2026-08-15T05:00:00.000Z");
  });

  it("formats valid values and survives malformed dates", () => {
    expect(toReadableDate("2026-08-15")).toContain("15 ago 2026");
    expect(toReadableDateLong("2026-08-15")).toContain("15 de agosto 2026");
    expect(toReadableDate("not-a-date")).toBe("Fecha invalida");
    expect(toReadableTime("09:05:00")).toBe("09:05");
    expect(toReadableTime(null)).toBe("--:--");
  });

  it("adds appointment duration without crashing on bad input", () => {
    expect(addMinutesToTime("09:30", 45)).toBe("10:15");
    expect(addMinutesToTime("bad", 45)).toBe("");
  });

  it("checks upcoming windows with local appointment timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T15:00:00.000Z"));

    expect(dateTimeWithinHours("2026-08-15", "12:00", 3)).toBe(true);
    expect(dateTimeWithinHours("2026-08-15", "16:00", 3)).toBe(false);
    expect(dateTimeWithinHours("bad", "bad", 3)).toBe(false);
  });
});
