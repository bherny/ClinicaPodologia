import { addHours, format, isSameDay, isValid, parseISO, startOfDay } from "date-fns";
import { es } from "date-fns/locale";

export function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}

export function tomorrowISO() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return format(tomorrow, "yyyy-MM-dd");
}

function parseSafeDate(date?: string | null) {
  if (!date) return null;
  const parsed = parseISO(date);
  return isValid(parsed) ? parsed : null;
}

export function toReadableDate(date?: string | null) {
  const parsed = parseSafeDate(date);
  return parsed ? format(parsed, "d MMM yyyy", { locale: es }) : "Fecha invalida";
}

export function toReadableDateLong(date?: string | null) {
  const parsed = parseSafeDate(date);
  return parsed ? format(parsed, "EEEE d 'de' MMMM yyyy", { locale: es }) : "Fecha invalida";
}

export function toReadableTime(time?: string | null) {
  return time ? time.slice(0, 5) : "--:--";
}

export type TimePeriod = "AM" | "PM";

export function toTime12Parts(time?: string | null) {
  const match = /^(\d{1,2}):([0-5]\d)/.exec(time ?? "");
  if (!match) return null;
  const hour24 = Number(match[1]);
  if (hour24 < 0 || hour24 > 23) return null;
  return {
    hour: String(hour24 % 12 || 12).padStart(2, "0"),
    minute: match[2],
    period: (hour24 >= 12 ? "PM" : "AM") as TimePeriod
  };
}

export function fromTime12Parts(hour: string, minute: string, period: TimePeriod) {
  const hour12 = Number(hour);
  const minutes = Number(minute);
  if (hour12 < 1 || hour12 > 12 || minutes < 0 || minutes > 59) return "";
  const hour24 = period === "PM" ? (hour12 % 12) + 12 : hour12 % 12;
  return `${String(hour24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function toReadableTime12(time?: string | null) {
  const parts = toTime12Parts(time);
  return parts ? `${Number(parts.hour)}:${parts.minute} ${parts.period}` : "--:--";
}

export function minutesBetweenTimes(start?: string | null, end?: string | null) {
  const startParts = /^(\d{1,2}):([0-5]\d)/.exec(start ?? "");
  const endParts = /^(\d{1,2}):([0-5]\d)/.exec(end ?? "");
  if (!startParts || !endParts) return 0;
  const startMinutes = Number(startParts[1]) * 60 + Number(startParts[2]);
  const endMinutes = Number(endParts[1]) * 60 + Number(endParts[2]);
  if (startMinutes < 0 || startMinutes >= 1440 || endMinutes <= startMinutes || endMinutes > 1440) return 0;
  return endMinutes - startMinutes;
}

export function formatMinutesDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remaining = safeMinutes % 60;
  if (!hours) return `${remaining} min`;
  return remaining ? `${hours} h ${remaining} min` : `${hours} h`;
}

export function toLimaTime12(value?: string | null, includeSeconds = false) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    hour: "numeric",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    hour12: true
  }).format(date);
}

export function combineDateTime(date: string, time: string) {
  return new Date(`${date}T${time}`);
}

export function isToday(date: string) {
  const parsed = parseSafeDate(date);
  return parsed ? isSameDay(parsed, new Date()) : false;
}

export function isTomorrow(date: string) {
  const parsed = parseSafeDate(date);
  if (!parsed) return false;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameDay(parsed, tomorrow);
}

export function addMinutesToTime(time: string, minutes: number) {
  const [hours, mins] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return "";
  const date = new Date();
  date.setHours(hours, mins + minutes, 0, 0);
  return format(date, "HH:mm");
}

export function dateTimeWithinHours(date: string, time: string, hours: number) {
  const now = new Date();
  const limit = addHours(now, hours);
  const value = combineDateTime(date, time);
  if (!isValid(value)) return false;
  return value >= now && value <= limit;
}

export function startOfTodayISO() {
  return startOfDay(new Date()).toISOString();
}
