import { addDays, format } from "date-fns";
import { supabase } from "../lib/supabase";
import { dateTimeWithinHours, todayISO, tomorrowISO } from "../lib/date";
import { buildReminderMessage } from "../lib/whatsapp";
import type { CitaDetalle, EstadoRecordatorio, Recordatorio } from "../types/domain";

const db = supabase as any;

const reminderSelect =
  "*, paciente:pacientes(id,nombres,apellidos,telefono,dni), sede:sedes(id,nombre,direccion,telefono), servicio:servicios(id,nombre,duracion_aproximada), profesional:profesionales(id,nombres,apellidos,especialidad), recordatorios(id,estado,fecha_envio,medio,mensaje,created_at)";

export type ReminderBucket =
  | "hoy"
  | "manana"
  | "24h"
  | "48h"
  | "sin_recordatorio"
  | "enviados"
  | "pendiente_respuesta"
  | "confirmados"
  | "reprogramadas"
  | "canceladas";

export async function listReminderAppointments(branchId: string, hoursAhead = 48) {
  const today = todayISO();
  const limit = format(addDays(new Date(), Math.ceil(hoursAhead / 24) + 1), "yyyy-MM-dd");

  let query = db
    .from("citas")
    .select(reminderSelect)
    .eq("eliminado", false)
    .gte("fecha", today)
    .lte("fecha", limit)
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true });

  if (branchId !== "all") query = query.eq("sede_id", branchId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((appointment: CitaDetalle) => ({
    ...appointment,
    recordatorios: [...(appointment.recordatorios ?? [])].sort((left, right) => right.created_at.localeCompare(left.created_at))
  })) as CitaDetalle[];
}

export function filterReminderBucket(citas: CitaDetalle[], bucket: ReminderBucket) {
  const today = todayISO();
  const tomorrow = tomorrowISO();

  return citas.filter((cita) => {
    const reminders = cita.recordatorios ?? [];
    const latest = reminders[0];
    const hasReminder = reminders.length > 0;
    const sentOrTracked = reminders.some((reminder) =>
      ["enviado", "pendiente_respuesta", "confirmado"].includes(reminder.estado)
    );

    if (bucket === "hoy") return cita.fecha === today;
    if (bucket === "manana") return cita.fecha === tomorrow;
    if (bucket === "24h") return dateTimeWithinHours(cita.fecha, cita.hora_inicio, 24);
    if (bucket === "48h") return dateTimeWithinHours(cita.fecha, cita.hora_inicio, 48);
    if (bucket === "sin_recordatorio") return !sentOrTracked && ["pendiente", "confirmada"].includes(cita.estado);
    if (bucket === "enviados") return latest?.estado === "enviado";
    if (bucket === "pendiente_respuesta") return latest?.estado === "pendiente_respuesta";
    if (bucket === "confirmados") return latest?.estado === "confirmado" || cita.estado === "confirmada";
    if (bucket === "reprogramadas") return latest?.estado === "reprogramado" || cita.estado === "reprogramada";
    if (bucket === "canceladas") return latest?.estado === "cancelado" || cita.estado === "cancelada";
    return hasReminder || !hasReminder;
  });
}

export async function saveReminderResult({
  cita,
  estado,
  observaciones,
  enviadoPor
}: {
  cita: CitaDetalle;
  estado: EstadoRecordatorio;
  observaciones?: string;
  enviadoPor?: string | null;
}) {
  const existingId = cita.recordatorios?.[0]?.id;
  const payload = {
    cita_id: cita.id,
    tipo: "whatsapp",
    fecha_programada: new Date(`${cita.fecha}T${cita.hora_inicio}`).toISOString(),
    estado,
    fecha_envio: ["enviado", "pendiente_respuesta", "confirmado"].includes(estado) ? new Date().toISOString() : null,
    enviado_por: enviadoPor ?? null,
    medio: "WhatsApp",
    mensaje: buildReminderMessage(cita),
    observaciones: observaciones ?? null
  };

  if (existingId) {
    const { data, error } = await db.from("recordatorios").update(payload).eq("id", existingId).select("*").single();
    if (error) throw error;
    return data as Recordatorio;
  }

  const { data, error } = await db.from("recordatorios").insert(payload).select("*").single();
  if (error) throw error;
  return data as Recordatorio;
}
