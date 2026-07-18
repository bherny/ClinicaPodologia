import { z } from "zod";
import { supabase } from "../lib/supabase";
import type { RecetaDetalle } from "../types/domain";

const db = supabase as any;
const optionalText = z.string().trim().optional().nullable();

export const prescriptionItemSchema = z.object({
  medicamento: z.string().trim().min(2, "Ingresa el medicamento o indicacion"),
  dosis: optionalText,
  frecuencia: optionalText,
  duracion: optionalText,
  via: optionalText,
  indicaciones: optionalText
});

export const prescriptionSchema = z.object({
  paciente_id: z.string().uuid("Selecciona un paciente"),
  sede_id: z.string().uuid("Selecciona una sede"),
  profesional_id: z.string().uuid("Selecciona un profesional"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresa una fecha valida"),
  diagnostico: optionalText,
  indicaciones_generales: optionalText,
  items: z.array(prescriptionItemSchema).min(1, "Agrega al menos un medicamento")
});

export type PrescriptionFormValues = z.infer<typeof prescriptionSchema>;

const detailSelect =
  "*, paciente:pacientes(id,nombres,apellidos,telefono,dni), sede:sedes(id,nombre,direccion,telefono), profesional:profesionales(id,nombres,apellidos,especialidad), items:receta_items(*)";

export async function listPrescriptions(branchId: string) {
  let query = db
    .from("recetas")
    .select(detailSelect)
    .eq("eliminado", false)
    .order("fecha", { ascending: false })
    .order("orden", { referencedTable: "receta_items", ascending: true })
    .limit(100);

  if (branchId !== "all") query = query.eq("sede_id", branchId);

  const { data, error } = await query;
  if (error) throw new Error(error.message ?? "No se pudieron cargar las recetas.");
  return (data ?? []) as RecetaDetalle[];
}

export async function getPatientPrescriptions(patientId: string) {
  const { data, error } = await db
    .from("recetas")
    .select(detailSelect)
    .eq("paciente_id", patientId)
    .eq("eliminado", false)
    .order("fecha", { ascending: false });
  if (error) throw new Error(error.message ?? "No se pudieron cargar las recetas del paciente.");
  return (data ?? []) as RecetaDetalle[];
}

export async function createPrescription(values: PrescriptionFormValues) {
  const { data, error } = await db.rpc("create_prescription", {
    p_patient_id: values.paciente_id,
    p_branch_id: values.sede_id,
    p_professional_id: values.profesional_id,
    p_date: values.fecha,
    p_diagnosis: values.diagnostico ?? "",
    p_general_instructions: values.indicaciones_generales ?? "",
    p_items: values.items.map((item, index) => ({ ...item, orden: index + 1 }))
  });
  if (error) throw new Error(error.message ?? "No se pudo emitir la receta.");
  return data as string;
}

export async function softDeletePrescription(id: string) {
  const { error } = await db.rpc("soft_delete_prescription", { p_prescription_id: id });
  if (error) throw new Error(error.message ?? "No se pudo eliminar la receta.");
}
