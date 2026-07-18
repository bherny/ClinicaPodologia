import { z } from "zod";
import { supabase } from "../lib/supabase";
import type { CitaDetalle, ExpedientePodologiaDetalle } from "../types/domain";

const db = supabase as any;
const optionalText = z.string().trim().optional().nullable();
const optionalUuid = z.preprocess((value) => (value === "" ? null : value), z.string().uuid().optional().nullable());
const optionalBoolean = z.preprocess(
  (value) => value === "" || value === undefined ? null : value === "true" ? true : value === "false" ? false : value,
  z.boolean().nullable()
);

export const podologyRecordSchema = z.object({
  paciente_id: z.string().uuid("Selecciona un paciente"),
  cita_id: z.string().uuid("Selecciona una cita podologica"),
  sede_id: z.string().uuid("Selecciona una sede"),
  profesional_id: optionalUuid,
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresa una fecha valida"),
  motivo_consulta: z.string().trim().min(3, "Describe el motivo de consulta"),
  pulso_pedio_izquierdo: optionalBoolean,
  pulso_pedio_derecho: optionalBoolean,
  pulso_tibial_izquierdo: optionalBoolean,
  pulso_tibial_derecho: optionalBoolean,
  temperatura: z.enum(["fria", "normal", "caliente"]).optional().nullable(),
  tipo_piel: z.enum(["seca", "grasa", "mixta"]).optional().nullable(),
  enfermedades: z.array(z.string()).default([]),
  otra_enfermedad: optionalText,
  tratamientos: z.array(z.string()).default([]),
  otro_tratamiento: optionalText,
  formas_unas: z.array(z.string()).default([]),
  alteraciones_unas: optionalText,
  alergias: optionalText,
  problemas_piel: z.array(z.string()).default([]),
  otro_problema_piel: optionalText,
  tipo_pie: z.enum(["romano", "egipcio", "griego", "cuadrado"]).optional().nullable(),
  mapa_anatomico_notas: optionalText,
  observaciones: optionalText
});

export type PodologyRecordFormValues = z.infer<typeof podologyRecordSchema>;

const detailSelect =
  "*, paciente:pacientes(id,nombres,apellidos,telefono,dni,direccion,fecha_nacimiento), sede:sedes(id,nombre,direccion,telefono), profesional:profesionales(id,nombres,apellidos,especialidad)";

const PODIATRY_SERVICE_PATTERN = /(podolog|quiropod|plantill|pedicur|onic|pie)/i;
const PODIATRY_CLINICAL_PATTERN = /(podolog|pie\b|pies\b|plantar|tal[o\u00f3]n|metatars|dedo|u[n\u00f1]a|ungueal|onic|callo|heloma|dureza|verruga plantar|espol[o\u00f3]n|fascitis plantar|pie diab[e\u00e9]tico)/i;

export function isPodologyRelatedAppointment(
  appointment: Pick<CitaDetalle, "diagnostico" | "tratamiento" | "observaciones" | "servicio">
) {
  const serviceName = appointment.servicio?.nombre ?? "";
  const clinicalContext = [appointment.diagnostico, appointment.tratamiento, appointment.observaciones]
    .filter(Boolean)
    .join(" ");
  return PODIATRY_SERVICE_PATTERN.test(serviceName) || PODIATRY_CLINICAL_PATTERN.test(clinicalContext);
}

export async function listPodologyRecords(branchId: string) {
  let query = db.from("expedientes_podologia").select(detailSelect).eq("eliminado", false).order("fecha", { ascending: false }).limit(100);
  if (branchId !== "all") query = query.eq("sede_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message ?? "No se pudieron cargar los expedientes podologicos.");
  return (data ?? []) as ExpedientePodologiaDetalle[];
}

export async function listPodologyAppointments(branchId: string) {
  let query = db
    .from("citas")
    .select("*, paciente:pacientes(id,nombres,apellidos,telefono,dni), sede:sedes(id,nombre,direccion,telefono), servicio:servicios!inner(id,nombre,duracion_aproximada), profesional:profesionales(id,nombres,apellidos,especialidad), expedientes_podologia(id,eliminado)")
    .eq("eliminado", false)
    .in("estado", ["pendiente", "confirmada", "atendida"])
    .order("fecha", { ascending: false })
    .limit(300);
  if (branchId !== "all") query = query.eq("sede_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message ?? "No se pudieron cargar las citas podologicas.");
  return (data ?? []).filter((appointment: CitaDetalle & { expedientes_podologia?: Array<{ eliminado: boolean }> }) =>
    isPodologyRelatedAppointment(appointment) &&
    !(appointment.expedientes_podologia ?? []).some((record) => !record.eliminado)
  ) as CitaDetalle[];
}

export async function createPodologyRecord(values: PodologyRecordFormValues) {
  const payload = {
    ...values,
    cita_id: values.cita_id,
    profesional_id: values.profesional_id || null,
    temperatura: values.temperatura || null,
    tipo_piel: values.tipo_piel || null,
    tipo_pie: values.tipo_pie || null
  };
  const { data, error } = await db.from("expedientes_podologia").insert(payload).select("id").single();
  if (error) throw new Error(error.message ?? "No se pudo guardar el expediente podologico.");
  return data.id as string;
}
