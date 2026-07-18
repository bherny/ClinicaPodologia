import { z } from "zod";
import { supabase } from "../lib/supabase";
import type { HistoriaClinica } from "../types/domain";

const db = supabase as any;

const optionalUuid = z.preprocess((value) => (value === "" ? null : value), z.string().uuid().optional().nullable());
const optionalDate = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .string()
    .refine((value) => {
      const year = Number(value.slice(0, 4));
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && year >= 2020 && year <= 2100;
    }, "Ingresa una fecha valida")
    .optional()
    .nullable()
);

export const clinicalHistorySchema = z.object({
  paciente_id: z.string().uuid(),
  cita_id: optionalUuid,
  sede_id: z.string().uuid("Selecciona una sede"),
  profesional_id: optionalUuid,
  diagnostico: z.string().min(2, "Ingresa el diagnostico"),
  tratamiento_realizado: z.string().min(2, "Ingresa el tratamiento realizado"),
  evolucion: z.string().optional().nullable(),
  recomendaciones: z.string().optional().nullable(),
  proxima_fecha_sugerida: optionalDate
});

export type ClinicalHistoryFormValues = z.infer<typeof clinicalHistorySchema>;

export async function listClinicalHistory(branchId: string) {
  let query = db
    .from("historias_clinicas")
    .select("*, paciente:pacientes(id,nombres,apellidos,telefono), cita:citas(id,fecha,hora_inicio,estado), sede:sedes(id,nombre), profesional:profesionales(id,nombres,apellidos)")
    .eq("eliminado", false)
    .order("created_at", { ascending: false })
    .limit(80);

  if (branchId !== "all") query = query.eq("sede_id", branchId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Array<HistoriaClinica & Record<string, any>>;
}

export async function createClinicalHistory(values: ClinicalHistoryFormValues) {
  const payload = {
    ...values,
    cita_id: values.cita_id || null,
    profesional_id: values.profesional_id || null,
    proxima_fecha_sugerida: values.proxima_fecha_sugerida || null
  };

  if (payload.cita_id) {
    const { data: existing, error: existingError } = await db
      .from("historias_clinicas")
      .select("id")
      .eq("cita_id", payload.cita_id)
      .eq("eliminado", false)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message ?? "No se pudo verificar la historia clinica de la cita.");

    if (existing?.id) {
      const { data, error } = await db
        .from("historias_clinicas")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message ?? "Supabase rechazo la actualizacion de la historia clinica.");
      return data as HistoriaClinica;
    }
  }

  const { data, error } = await db.from("historias_clinicas").insert(payload).select("*").single();
  if (error) throw new Error(error.message ?? "Supabase rechazo el registro de la historia clinica.");
  return data as HistoriaClinica;
}

export async function softDeleteClinicalHistory(id: string) {
  const { error } = await db.rpc("soft_delete_clinical_history", { p_history_id: id });
  if (error) throw new Error(error.message ?? "Supabase rechazo la eliminacion de la historia clinica.");
}
