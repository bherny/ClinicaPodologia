import type { CitaDetalle, Paciente, Profesional } from "../types/domain";

export function fullName(person: Pick<Paciente | Profesional, "nombres" | "apellidos"> | null | undefined) {
  if (!person) return "Sin asignar";
  return `${person.nombres} ${person.apellidos}`.trim();
}

export function money(value: number | null | undefined) {
  if (value == null) return "Sin precio";
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN"
  }).format(value);
}

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function appointmentPatientPhone(cita: CitaDetalle) {
  return cita.paciente?.telefono ?? "";
}
