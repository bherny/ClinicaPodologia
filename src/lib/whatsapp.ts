import { WHATSAPP_BASE_MESSAGE } from "../constants";
import { toReadableDateLong, toReadableTime } from "./date";
import { fullName, normalizePhone } from "./format";
import type { CitaDetalle } from "../types/domain";

export function buildReminderMessage(cita: CitaDetalle) {
  return WHATSAPP_BASE_MESSAGE.replace("[nombre del paciente]", fullName(cita.paciente))
    .replace("[servicio]", cita.servicio?.nombre ?? "tu tratamiento")
    .replace("[sede]", cita.sede?.nombre ?? "Body Feet")
    .replace("[fecha]", toReadableDateLong(cita.fecha))
    .replace("[hora]", toReadableTime(cita.hora_inicio));
}

export function buildWhatsAppUrl(phone: string, message: string) {
  const normalized = normalizePhone(phone);
  const peruNumber = normalized.startsWith("51") ? normalized : `51${normalized}`;
  return `https://wa.me/${peruNumber}?text=${encodeURIComponent(message)}`;
}

export function hasValidWhatsAppPhone(phone: string) {
  const normalized = normalizePhone(phone);
  const localNumber = normalized.startsWith("51") ? normalized.slice(2) : normalized;
  return /^9\d{8}$/.test(localNumber);
}
