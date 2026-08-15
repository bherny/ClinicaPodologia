import { z } from "zod";
import { supabase } from "../lib/supabase";
import type { HistoriaClinica, HistoriaClinicaDetalle } from "../types/domain";

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
  diagnostico: z.string().trim().min(2, "Ingresa el diagnostico"),
  tratamiento_realizado: z.string().trim().min(2, "Ingresa el tratamiento realizado"),
  evolucion: z.string().trim().optional().nullable(),
  recomendaciones: z.string().trim().optional().nullable(),
  proxima_fecha_sugerida: optionalDate
});

export type ClinicalHistoryFormValues = z.infer<typeof clinicalHistorySchema>;

const clinicalHistorySelect =
  "*, paciente:pacientes(id,nombres,apellidos,dni,telefono,fecha_nacimiento,direccion,sexo), cita:citas(id,fecha,hora_inicio,estado,diagnostico,tratamiento,observaciones,servicio:servicios(id,nombre),expedientes_podologia(id,motivo_consulta,pulso_pedio_izquierdo,pulso_pedio_derecho,pulso_tibial_izquierdo,pulso_tibial_derecho,temperatura,tipo_piel,enfermedades,otra_enfermedad,tratamientos,otro_tratamiento,formas_unas,alteraciones_unas,alergias,problemas_piel,otro_problema_piel,tipo_pie,mapa_anatomico_notas,observaciones,eliminado)), sede:sedes(id,nombre,direccion,telefono), profesional:profesionales(id,nombres,apellidos,especialidad,telefono)";

function clinicalOperationError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (/row-level security|permission|not authorized|no tienes permiso/i.test(message)) {
    return new Error("No tienes permisos para realizar esta accion sobre la historia clinica.");
  }
  return new Error(fallback);
}

function normalizeHistoryPayload(values: ClinicalHistoryFormValues) {
  return {
    ...values,
    cita_id: values.cita_id || null,
    profesional_id: values.profesional_id || null,
    evolucion: values.evolucion || null,
    recomendaciones: values.recomendaciones || null,
    proxima_fecha_sugerida: values.proxima_fecha_sugerida || null
  };
}

export async function listClinicalHistory(branchId: string) {
  let query = db
    .from("historias_clinicas")
    .select(clinicalHistorySelect)
    .eq("eliminado", false)
    .order("created_at", { ascending: false })
    .limit(100);

  if (branchId !== "all") query = query.eq("sede_id", branchId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as HistoriaClinicaDetalle[];
}

export async function createClinicalHistory(values: ClinicalHistoryFormValues) {
  const payload = normalizeHistoryPayload(values);

  if (payload.cita_id) {
    const { data: existing, error: existingError } = await db
      .from("historias_clinicas")
      .select("id")
      .eq("cita_id", payload.cita_id)
      .eq("eliminado", false)
      .maybeSingle();

    if (existingError) throw clinicalOperationError(existingError, "No se pudo verificar la historia clinica de la cita.");

    if (existing?.id) {
      const { data, error } = await db
        .from("historias_clinicas")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw clinicalOperationError(error, "No se pudo actualizar la historia clinica.");
      return data as HistoriaClinica;
    }
  }

  const { data, error } = await db.from("historias_clinicas").insert(payload).select("*").single();
  if (error) throw clinicalOperationError(error, "No se pudo guardar la historia clinica.");
  return data as HistoriaClinica;
}

export async function updateClinicalHistory(id: string, values: ClinicalHistoryFormValues) {
  const payload = normalizeHistoryPayload(values);
  const { data, error } = await db
    .from("historias_clinicas")
    .update(payload)
    .eq("id", id)
    .eq("eliminado", false)
    .select("*")
    .single();

  if (error) throw clinicalOperationError(error, "No se pudo actualizar la historia clinica.");
  return data as HistoriaClinica;
}

export async function recordClinicalHistoryDocumentAction(
  historyId: string,
  action: "descarga_pdf" | "intento_compartir_whatsapp",
  metadata: Record<string, unknown> = {}
) {
  const { error } = await db.rpc("record_clinical_document_action", {
    p_history_id: historyId,
    p_action: action,
    p_metadata: metadata
  });

  if (error) {
    const missingFunction = /record_clinical_document_action|schema cache|PGRST202/i.test(error.message ?? "");
    if (missingFunction) {
      throw new Error("El registro de auditoria documental aun no esta configurado. Contacta al administrador del sistema.");
    }
    throw clinicalOperationError(error, "No se pudo registrar la accion del documento en auditoria.");
  }
}

export async function softDeleteClinicalHistory(id: string) {
  const { error } = await db.rpc("soft_delete_clinical_history", { p_history_id: id });
  if (error) throw clinicalOperationError(error, "No se pudo eliminar la historia clinica.");
}
