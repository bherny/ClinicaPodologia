import { z } from "zod";
import { supabase } from "../lib/supabase";
import type { Cita, CitaDetalle, EstadoCita } from "../types/domain";

const db = supabase as any;

const appointmentDate = z
  .string()
  .min(1, "Selecciona una fecha")
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && year >= 2020 && year <= 2100;
  }, "Ingresa una fecha valida");

export const appointmentSchema = z.object({
  paciente_id: z.preprocess((value) => (value === "" ? null : value), z.string().uuid().optional().nullable()),
  sede_id: z.string().uuid("Selecciona una sede"),
  servicio_id: z.string().uuid("Selecciona un servicio"),
  profesional_id: z.string().uuid().optional().nullable(),
  fecha: appointmentDate,
  hora_inicio: z.string().min(1, "Indica hora de inicio"),
  hora_fin: z.string().min(1, "Indica hora de fin"),
  diagnostico: z.string().optional().nullable(),
  tratamiento: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  estado: z
    .enum(["pendiente", "confirmada", "atendida", "reprogramada", "cancelada", "no_asistio"])
    .default("pendiente"),
  creado_por: z.string().uuid().optional().nullable()
}).superRefine((values, context) => {
  if (values.hora_inicio && values.hora_fin && values.hora_fin <= values.hora_inicio) {
    context.addIssue({
      code: "custom",
      path: ["hora_fin"],
      message: "La hora de finalización debe ser posterior a la hora de inicio"
    });
  }
});

export type AppointmentFormValues = z.infer<typeof appointmentSchema>;

export type AppointmentFilters = {
  branchId?: string;
  professionalId?: string;
  serviceId?: string;
  status?: EstadoCita | "all";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

const appointmentSelect =
  "*, paciente:pacientes(id,nombres,apellidos,telefono,dni), sede:sedes(id,nombre,direccion,telefono), servicio:servicios(id,nombre,duracion_aproximada), profesional:profesionales(id,nombres,apellidos,especialidad), recordatorios(id,estado,fecha_envio,medio,mensaje)";

export async function listAppointments(filters: AppointmentFilters = {}) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = db
    .from("citas")
    .select(appointmentSelect, { count: "exact" })
    .eq("eliminado", false)
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true })
    .range(from, to);

  if (filters.branchId && filters.branchId !== "all") query = query.eq("sede_id", filters.branchId);
  if (filters.professionalId) query = query.eq("profesional_id", filters.professionalId);
  if (filters.serviceId) query = query.eq("servicio_id", filters.serviceId);
  if (filters.status && filters.status !== "all") query = query.eq("estado", filters.status);
  if (filters.dateFrom) query = query.gte("fecha", filters.dateFrom);
  if (filters.dateTo) query = query.lte("fecha", filters.dateTo);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as CitaDetalle[], count: count ?? 0 };
}

export async function getAppointment(id: string) {
  const { data, error } = await db.from("citas").select(appointmentSelect).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as CitaDetalle | null;
}

export async function createAppointment(values: AppointmentFormValues) {
  if (!values.paciente_id) {
    throw new Error("Selecciona un paciente o registra uno nuevo desde la cita.");
  }

  const conflicts = await findAppointmentConflicts(values);
  if (conflicts.length) {
    throw new Error("Hay un cruce de horario para este profesional, sede y fecha. Ajusta la hora antes de guardar.");
  }
  const { data, error } = await db.from("citas").insert(values).select("*").single();
  if (error) throw error;
  return data as Cita;
}

export async function updateAppointment(id: string, values: AppointmentFormValues) {
  const conflicts = await findAppointmentConflicts(values, id);
  if (conflicts.length) {
    throw new Error("Hay un cruce de horario para este profesional, sede y fecha. Ajusta la hora antes de guardar.");
  }
  const { data, error } = await db.from("citas").update(values).eq("id", id).select("*").single();
  if (error) throw error;
  return data as Cita;
}

export async function updateAppointmentStatus(id: string, estado: EstadoCita) {
  const { error } = await db.from("citas").update({ estado }).eq("id", id);
  if (error) throw error;
}

export async function softDeleteAppointment(id: string) {
  const { error } = await db.rpc("soft_delete_appointment", { p_appointment_id: id });
  if (error) throw new Error(error.message ?? "Supabase rechazo la eliminacion de la cita.");
}

export async function findAppointmentConflicts(values: Partial<AppointmentFormValues>, excludeId?: string) {
  if (!values.profesional_id || !values.sede_id || !values.fecha || !values.hora_inicio || !values.hora_fin) return [];

  let query = db
    .from("citas")
    .select("id,fecha,hora_inicio,hora_fin,estado")
    .eq("eliminado", false)
    .eq("sede_id", values.sede_id)
    .eq("profesional_id", values.profesional_id)
    .eq("fecha", values.fecha)
    .in("estado", ["pendiente", "confirmada", "atendida"])
    .lt("hora_inicio", values.hora_fin)
    .gt("hora_fin", values.hora_inicio);

  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
