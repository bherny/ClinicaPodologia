import { supabase } from "../lib/supabase";
import { optimizeClinicalPhoto } from "../lib/clinicalPhoto";
import type {
  EtapaFotoClinica,
  FotoHistoriaClinica,
  HistoriaClinicaDetalle,
  SesionFisioterapia
} from "../types/domain";
import type { SignatureStroke } from "./signatures";

// Keep the same runtime-safe Supabase access pattern used by the existing services.
// The hand-maintained database schema intentionally does not model every relationship.
const db = supabase as any;
const PHOTO_BUCKET = "clinical-history-photos";

export type PhysiotherapySessionInput = {
  fecha: string;
  motivo_zona: string;
  diagnostico_medico: string;
  eva_inicial: number | null;
  eva_final: number | null;
  zona_dolor: string;
  observaciones_clinicas: string[];
  observacion_otro: string;
  hallazgos: string;
  tratamientos: string[];
  otro_tratamiento: string;
  ejercicios_dosificacion: string;
  evolucion: SesionFisioterapia["evolucion"];
  respuesta_paciente: string;
  indicaciones_proxima_sesion: string;
  tecnico_nombre: string;
  firma_trazos: SignatureStroke[];
};

function timelineError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (/schema cache|does not exist|PGRST20/i.test(message)) {
    return new Error("Activa la migracion 202610250001_physiotherapy_sessions_and_clinical_photos.sql en Supabase.");
  }
  if (/row-level security|permission|not allowed/i.test(message)) return new Error("No tienes permiso para modificar este historial clinico.");
  return new Error(message || fallback);
}

export async function listClinicalTimeline(historyId: string) {
  const [sessionsResult, photosResult] = await Promise.all([
    db.from("sesiones_fisioterapia").select("*").eq("historia_clinica_id", historyId).eq("eliminado", false).order("fecha", { ascending: false }).order("numero_sesion", { ascending: false }),
    db.from("historia_clinica_fotos").select("*").eq("historia_clinica_id", historyId).eq("eliminado", false).order("fecha_toma", { ascending: false })
  ]);

  if (sessionsResult.error) throw timelineError(sessionsResult.error, "No se pudieron cargar las sesiones.");
  if (photosResult.error) throw timelineError(photosResult.error, "No se pudieron cargar las fotografias.");

  const photos = (photosResult.data ?? []) as FotoHistoriaClinica[];
  if (photos.length) {
    const { data: signed, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(photos.map((photo) => photo.storage_path), 60 * 60);
    if (error) throw timelineError(error, "No se pudieron abrir las fotografias clinicas.");
    signed?.forEach((item, index) => { photos[index].signed_url = item.signedUrl ?? undefined; });
  }

  return { sessions: (sessionsResult.data ?? []) as SesionFisioterapia[], photos };
}

export async function createPhysiotherapySession(
  history: HistoriaClinicaDetalle,
  input: PhysiotherapySessionInput,
  profileId: string
) {
  const { data: latest, error: latestError } = await db
    .from("sesiones_fisioterapia")
    .select("numero_sesion")
    .eq("historia_clinica_id", history.id)
    .order("numero_sesion", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw timelineError(latestError, "No se pudo calcular el numero de sesion.");

  const { data, error } = await db.from("sesiones_fisioterapia").insert({
    ...input,
    historia_clinica_id: history.id,
    paciente_id: history.paciente_id,
    sede_id: history.sede_id,
    profesional_id: history.profesional_id,
    numero_sesion: Number(latest?.numero_sesion ?? 0) + 1,
    creado_por: profileId,
    motivo_zona: input.motivo_zona.trim() || null,
    diagnostico_medico: input.diagnostico_medico.trim() || null,
    zona_dolor: input.zona_dolor.trim() || null,
    observacion_otro: input.observacion_otro.trim() || null,
    hallazgos: input.hallazgos.trim() || null,
    otro_tratamiento: input.otro_tratamiento.trim() || null,
    ejercicios_dosificacion: input.ejercicios_dosificacion.trim() || null,
    respuesta_paciente: input.respuesta_paciente.trim() || null,
    indicaciones_proxima_sesion: input.indicaciones_proxima_sesion.trim() || null,
    tecnico_nombre: input.tecnico_nombre.trim() || null
  }).select("*").single();
  if (error) throw timelineError(error, "No se pudo guardar la sesion de fisioterapia.");
  return data as SesionFisioterapia;
}

export async function uploadClinicalPhoto(input: {
  history: HistoriaClinicaDetalle;
  sessionId?: string | null;
  stage: EtapaFotoClinica;
  takenAt: string;
  note: string;
  file: File;
  profileId: string;
}) {
  const photo = await optimizeClinicalPhoto(input.file);
  const storagePath = `${input.history.id}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(storagePath, photo, {
    cacheControl: "31536000",
    contentType: "image/jpeg",
    upsert: false
  });
  if (uploadError) throw timelineError(uploadError, "No se pudo subir la fotografia.");

  const { data, error } = await db.from("historia_clinica_fotos").insert({
    historia_clinica_id: input.history.id,
    sesion_fisioterapia_id: input.sessionId || null,
    paciente_id: input.history.paciente_id,
    sede_id: input.history.sede_id,
    etapa: input.stage,
    fecha_toma: input.takenAt,
    storage_path: storagePath,
    nota: input.note.trim() || null,
    creado_por: input.profileId
  }).select("*").single();
  if (error) {
    await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
    throw timelineError(error, "No se pudo registrar la fotografia.");
  }
  return data as FotoHistoriaClinica;
}

export async function softDeletePhysiotherapySession(id: string) {
  const { error } = await db.from("sesiones_fisioterapia").update({ eliminado: true }).eq("id", id);
  if (error) throw timelineError(error, "No se pudo eliminar la sesion.");
}

export async function softDeleteClinicalPhoto(photo: FotoHistoriaClinica) {
  const { error } = await db.from("historia_clinica_fotos").update({ eliminado: true }).eq("id", photo.id);
  if (error) throw timelineError(error, "No se pudo eliminar la fotografia.");
  await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
}
