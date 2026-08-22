import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addMinutesToTime,
  dateTimeWithinHours,
  isToday,
  isTomorrow,
  formatMinutesDuration,
  fromTime12Parts,
  minutesBetweenTimes,
  startOfTodayISO,
  todayISO,
  tomorrowISO,
  toLimaTime12,
  toReadableDate,
  toReadableDateLong,
  toReadableTime,
  toReadableTime12,
  toTime12Parts
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

  it("converts stored 24-hour schedules to clear AM/PM values", () => {
    expect(toTime12Parts("00:05:00")).toEqual({ hour: "12", minute: "05", period: "AM" });
    expect(toTime12Parts("18:30:00")).toEqual({ hour: "06", minute: "30", period: "PM" });
    expect(fromTime12Parts("12", "00", "AM")).toBe("00:00");
    expect(fromTime12Parts("06", "30", "PM")).toBe("18:30");
    expect(toReadableTime12("18:30:00")).toBe("6:30 PM");
    expect(toLimaTime12("2026-08-21T13:30:00.000Z")).toBe("8:30 AM");
    expect(minutesBetweenTimes("08:00", "18:00")).toBe(600);
    expect(minutesBetweenTimes("18:00", "08:00")).toBe(0);
    expect(formatMinutesDuration(600)).toBe("10 h");
    expect(formatMinutesDuration(510)).toBe("8 h 30 min");
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
