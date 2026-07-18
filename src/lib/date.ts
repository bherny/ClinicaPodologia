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
