import type { EstadoCita, EstadoRecordatorio, RolUsuario } from "./types/domain";

export const APP_NAME = "Body Feet";

export const APPOINTMENT_STATUS_LABELS: Record<EstadoCita, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  atendida: "Atendida",
  reprogramada: "Reprogramada",
  cancelada: "Cancelada",
  no_asistio: "No asistio"
};

export const REMINDER_STATUS_LABELS: Record<EstadoRecordatorio, string> = {
  programado: "Programado",
  enviado: "Enviado",
  pendiente_respuesta: "Pendiente de respuesta",
  confirmado: "Confirmado",
  reprogramado: "Reprogramado",
  cancelado: "Cancelado",
  no_contactado: "No se pudo contactar"
};

export const ROLE_LABELS: Record<RolUsuario, string> = {
  administrador: "Administrador",
  recepcion: "Recepcion",
  profesional: "Profesional"
};

export const APPOINTMENT_STATUSES = Object.entries(APPOINTMENT_STATUS_LABELS).map(([value, label]) => ({
  value,
  label
}));

export const REMINDER_STATUSES = Object.entries(REMINDER_STATUS_LABELS).map(([value, label]) => ({
  value,
  label
}));

export const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({
  value,
  label
}));

export const WHATSAPP_BASE_MESSAGE =
  "Hola, [nombre del paciente]. Te escribimos de Body Feet para recordarte que tienes una cita de [servicio] en nuestra sede de [sede], programada para el dia [fecha] a las [hora]. Por favor, confirmanos tu asistencia respondiendo a este mensaje. Muchas gracias.";
