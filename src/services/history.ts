import { z } from "zod";
import { supabase } from "../lib/supabase";
import type {
  HistoriaClinica,
  HistoriaClinicaDetalle,
  HistoriaClinicaEvaluacion
} from "../types/domain";

const db = supabase as any;

const optionalUuid = z.preprocess((value) => (value === "" ? null : value), z.string().uuid().optional().nullable());
const optionalDate = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .string()
    .refine((value) => {
      const year = Number(value.slice(0, 4));
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && year >= 1900 && year <= 2100;
    }, "Ingresa una fecha valida")
    .optional()
    .nullable()
);
const requiredClinicalDate = z.string().refine((value) => {
  const year = Number(value.slice(0, 4));
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && year >= 1900 && year <= 2100;
}, "Ingresa una fecha valida");
const shortText = z.string().trim().max(240, "El texto es demasiado largo");
const clinicalText = z.string().trim().max(5000, "El texto es demasiado largo");
const yesNo = z.enum(["", "si", "no"]);
const factors = [
  "flexionado",
  "derecho",
  "sentado",
  "de_pie",
  "sentarse",
  "levantarse",
  "quieto",
  "movimiento",
  "am",
  "conforme_pasa_dia",
  "pm",
  "caminando",
  "tumbado"
] as const;

const clinicalEvaluationSchema = z.object({
  version: z.literal(1),
  como_conocio: shortText,
  actividad_laboral: shortText,
  horas_laborales: shortText,
  actividad_laboral_movimiento: z.enum(["", "quieto", "en_movimiento"]),
  baja_laboral: yesNo,
  deporte_actividad_fisica_ocio: clinicalText,
  horas_dia: shortText,
  dias_semana: shortText,
  cargas_autocargas: shortText,
  especificaciones_actividad: clinicalText,
  motivo_consulta: clinicalText,
  sintomas_presentes: clinicalText,
  presentes_desde: shortText,
  tras_realizar: shortText,
  comenzaron_por: shortText,
  sin_motivo: z.boolean(),
  donde_comenzaron: shortText,
  evolucion_sintomas: z.enum(["", "mejorando", "empeorando", "sin_cambios"]),
  tiempo_aparecer_sintomas: shortText,
  episodio_anterior: clinicalText,
  tratamiento_anterior_actual: clinicalText,
  sintomas_constantes: clinicalText,
  sintomas_intermitentes: clinicalText,
  eva: z.string().trim().refine((value) => {
    if (!value) return true;
    const eva = Number(value);
    return Number.isFinite(eva) && eva >= 0 && eva <= 10;
  }, "La escala EVA debe estar entre 0 y 10"),
  dolor_impidio_trabajar: yesNo,
  localizacion_dolor_notas: clinicalText,
  localizacion_dolor_puntos: z.array(z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100)
  })).max(40),
  limitaciones: clinicalText,
  dolor_nocturno: yesNo,
  dolor_tos_estornudo_esfuerzo: yesNo,
  marcha: z.enum(["", "normal", "diferente"]),
  continencia_vesical_intestinal: yesNo,
  salud_general_comorbilidades: clinicalText,
  medicacion: clinicalText,
  cirugia: clinicalText,
  pruebas_imagen: clinicalText,
  cambio_peso: shortText,
  historial_cancer: clinicalText,
  historia_trauma: clinicalText,
  peor: z.array(z.enum(factors)),
  peor_otro: shortText,
  mejor: z.array(z.enum(factors)),
  mejor_otro: shortText,
  culpa_percibida: clinicalText,
  expectativa_visita: clinicalText,
  informacion_importante: clinicalText,
  tests: z.array(clinicalText).length(3),
  reevaluacion: clinicalText,
  anotaciones: clinicalText,
  hipotesis_diagnostico: z.array(clinicalText).length(3),
  trabajo_casa: clinicalText
});

export const clinicalHistorySchema = z.object({
  paciente_id: z.string().uuid("Selecciona un paciente"),
  cita_id: optionalUuid,
  sede_id: z.string().uuid("Selecciona una sede"),
  profesional_id: optionalUuid,
  fecha_evaluacion: requiredClinicalDate,
  diagnostico: clinicalText,
  tratamiento_realizado: clinicalText,
  evolucion: clinicalText,
  recomendaciones: clinicalText,
  proxima_fecha_sugerida: optionalDate,
  evaluacion: clinicalEvaluationSchema
});

export type ClinicalHistoryFormValues = z.infer<typeof clinicalHistorySchema>;

export function createEmptyClinicalEvaluation(): HistoriaClinicaEvaluacion {
  return {
    version: 1,
    como_conocio: "",
    actividad_laboral: "",
    horas_laborales: "",
    actividad_laboral_movimiento: "",
    baja_laboral: "",
    deporte_actividad_fisica_ocio: "",
    horas_dia: "",
    dias_semana: "",
    cargas_autocargas: "",
    especificaciones_actividad: "",
    motivo_consulta: "",
    sintomas_presentes: "",
    presentes_desde: "",
    tras_realizar: "",
    comenzaron_por: "",
    sin_motivo: false,
    donde_comenzaron: "",
    evolucion_sintomas: "",
    tiempo_aparecer_sintomas: "",
    episodio_anterior: "",
    tratamiento_anterior_actual: "",
    sintomas_constantes: "",
    sintomas_intermitentes: "",
    eva: "",
    dolor_impidio_trabajar: "",
    localizacion_dolor_notas: "",
    localizacion_dolor_puntos: [],
    limitaciones: "",
    dolor_nocturno: "",
    dolor_tos_estornudo_esfuerzo: "",
    marcha: "",
    continencia_vesical_intestinal: "",
    salud_general_comorbilidades: "",
    medicacion: "",
    cirugia: "",
    pruebas_imagen: "",
    cambio_peso: "",
    historial_cancer: "",
    historia_trauma: "",
    peor: [],
    peor_otro: "",
    mejor: [],
    mejor_otro: "",
    culpa_percibida: "",
    expectativa_visita: "",
    informacion_importante: "",
    tests: ["", "", ""],
    reevaluacion: "",
    anotaciones: "",
    hipotesis_diagnostico: ["", "", ""],
    trabajo_casa: ""
  };
}

export function normalizeClinicalEvaluation(value?: Partial<HistoriaClinicaEvaluacion> | null): HistoriaClinicaEvaluacion {
  const empty = createEmptyClinicalEvaluation();
  if (!value || typeof value !== "object") return empty;
  return {
    ...empty,
    ...value,
    version: 1,
    peor: Array.isArray(value.peor) ? value.peor.filter((item): item is HistoriaClinicaEvaluacion["peor"][number] => factors.includes(item as typeof factors[number])) : [],
    mejor: Array.isArray(value.mejor) ? value.mejor.filter((item): item is HistoriaClinicaEvaluacion["mejor"][number] => factors.includes(item as typeof factors[number])) : [],
    tests: [0, 1, 2].map((index) => value.tests?.[index] ?? ""),
    hipotesis_diagnostico: [0, 1, 2].map((index) => value.hipotesis_diagnostico?.[index] ?? ""),
    localizacion_dolor_puntos: Array.isArray(value.localizacion_dolor_puntos)
      ? value.localizacion_dolor_puntos
          .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
          .map((point) => ({ x: Math.min(100, Math.max(0, point.x)), y: Math.min(100, Math.max(0, point.y)) }))
          .slice(0, 40)
      : []
  };
}

const clinicalHistorySelect =
  "*, paciente:pacientes(id,nombres,apellidos,dni,telefono,fecha_nacimiento,direccion,sexo), cita:citas(id,fecha,hora_inicio,estado,diagnostico,tratamiento,observaciones,servicio:servicios(id,nombre),expedientes_podologia(id,motivo_consulta,pulso_pedio_izquierdo,pulso_pedio_derecho,pulso_tibial_izquierdo,pulso_tibial_derecho,temperatura,tipo_piel,enfermedades,otra_enfermedad,tratamientos,otro_tratamiento,formas_unas,alteraciones_unas,alergias,problemas_piel,otro_problema_piel,tipo_pie,mapa_anatomico_notas,observaciones,eliminado)), sede:sedes(id,nombre,direccion,telefono), profesional:profesionales(id,nombres,apellidos,especialidad,telefono)";

function clinicalOperationError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (/fecha_evaluacion|evaluacion|schema cache|PGRST204/i.test(message)) {
    return new Error("La ficha clinica completa aun no esta habilitada en Supabase. Ejecuta la migracion 202608250001_complete_clinical_history.sql.");
  }
  if (/row-level security|permission|not authorized|no tienes permiso/i.test(message)) {
    return new Error("No tienes permisos para realizar esta accion sobre la historia clinica.");
  }
  return new Error(message || fallback);
}

function normalizeHistoryPayload(values: ClinicalHistoryFormValues) {
  const evaluation = normalizeClinicalEvaluation(values.evaluacion);
  const hypotheses = evaluation.hipotesis_diagnostico.filter(Boolean);
  return {
    ...values,
    cita_id: values.cita_id || null,
    profesional_id: values.profesional_id || null,
    diagnostico: values.diagnostico || hypotheses.join("\n") || "Pendiente de registrar",
    tratamiento_realizado: values.tratamiento_realizado || "Pendiente de registrar",
    evolucion: values.evolucion || evaluation.reevaluacion || null,
    recomendaciones: values.recomendaciones || evaluation.trabajo_casa || null,
    proxima_fecha_sugerida: values.proxima_fecha_sugerida || null,
    evaluacion: evaluation
  };
}

export async function listClinicalHistory(branchId: string) {
  let query = db
    .from("historias_clinicas")
    .select(clinicalHistorySelect)
    .eq("eliminado", false)
    .order("fecha_evaluacion", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (branchId !== "all") query = query.eq("sede_id", branchId);

  const { data, error } = await query;
  if (error) throw clinicalOperationError(error, "No se pudieron cargar las historias clinicas.");
  return (data ?? []).map((item: HistoriaClinicaDetalle) => ({
    ...item,
    fecha_evaluacion: item.fecha_evaluacion ?? item.cita?.fecha ?? item.created_at.slice(0, 10),
    evaluacion: normalizeClinicalEvaluation(item.evaluacion)
  })) as HistoriaClinicaDetalle[];
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