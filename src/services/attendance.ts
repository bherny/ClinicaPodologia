import { supabase } from "../lib/supabase";
import type {
  AttendanceContext,
  JornadaAsistenciaDetalle,
  Producto,
  TurnoProfesional,
  TurnoProfesionalDetalle
} from "../types/domain";

const db = supabase as any;
export const ATTENDANCE_BUCKET = "attendance-evidence";

export type AttendanceFilters = {
  branchId?: string;
  professionalId?: string;
  from?: string;
  to?: string;
  markType?: "entrada" | "salida" | "all";
  page?: number;
  pageSize?: number;
};

export async function getAttendanceContext(branchId?: string | null, professionalId?: string | null) {
  const { data, error } = await db.rpc("get_attendance_context", {
    p_professional_id: professionalId || null,
    p_branch_id: branchId && branchId !== "all" ? branchId : null
  });
  if (error) throw new Error(error.message ?? "No se pudo verificar la marcacion.");
  return data as AttendanceContext;
}

export async function uploadAttendanceEvidence(path: string, blob: Blob) {
  const { error } = await supabase.storage.from(ATTENDANCE_BUCKET).upload(path, blob, {
    contentType: "image/webp",
    cacheControl: "3600",
    upsert: false
  });
  if (error) throw new Error(error.message ?? "No se pudo subir la fotografia.");
}

export async function removeAttendanceEvidence(path: string) {
  await supabase.storage.from(ATTENDANCE_BUCKET).remove([path]);
}

export async function registerAttendanceMark(values: {
  professionalId: string;
  branchId: string;
  photoPath: string;
  expectedType: "entrada" | "salida";
  requestId: string;
}) {
  const { data, error } = await db.rpc("register_attendance_mark_for", {
    p_professional_id: values.professionalId,
    p_branch_id: values.branchId,
    p_photo_path: values.photoPath,
    p_expected_type: values.expectedType,
    p_request_id: values.requestId
  });
  if (error) throw new Error(error.message ?? "No se pudo registrar la marcacion.");
  return data as {
    success: boolean;
    id: string;
    type: "entrada" | "salida";
    recorded_at: string;
    status: string;
    minutes_worked?: number;
    idempotent: boolean;
  };
}

export async function createAttendanceSignedUrl(path: string, expiresIn = 300) {
  const { data, error } = await supabase.storage.from(ATTENDANCE_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message ?? "No se pudo abrir la evidencia.");
  return data.signedUrl;
}

export async function listAttendance(filters: AttendanceFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const fromIndex = (page - 1) * pageSize;
  let query = db
    .from("jornadas_asistencia")
    .select(
      "*, profesional:profesionales(id,nombres,apellidos,especialidad,activo), sede:sedes(id,nombre), turno:turnos_profesionales(id,hora_inicio,hora_fin,es_descanso,tolerancia_minutos)",
      { count: "exact" }
    )
    .order("entrada_at", { ascending: false })
    .range(fromIndex, fromIndex + pageSize - 1);
  if (filters.branchId && filters.branchId !== "all") query = query.eq("sede_id", filters.branchId);
  if (filters.professionalId) query = query.eq("profesional_id", filters.professionalId);
  if (filters.from) query = query.gte("fecha_local", filters.from);
  if (filters.to) query = query.lte("fecha_local", filters.to);
  if (filters.markType === "salida") query = query.not("salida_at", "is", null);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message ?? "No se pudo cargar la asistencia.");
  return { data: (data ?? []) as JornadaAsistenciaDetalle[], count: count ?? 0, page, pageSize };
}

export async function listAttendanceForReport(filters: Omit<AttendanceFilters, "page" | "pageSize">) {
  const rows: JornadaAsistenciaDetalle[] = [];
  let page = 1;
  while (true) {
    const result = await listAttendance({ ...filters, page, pageSize: 100 });
    rows.push(...result.data);
    if (rows.length >= result.count || result.data.length === 0) break;
    page += 1;
  }
  return rows;
}
export async function listOwnerShifts(includeInactive = false) {
  let query = db
    .from("turnos_profesionales")
    .select("*, profesional:profesionales(id,nombres,apellidos,especialidad,activo), sede:sedes(id,nombre)")
    .order("profesional_id")
    .order("dia_semana")
    .order("vigente_desde", { ascending: false });
  if (!includeInactive) query = query.eq("activo", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message ?? "No se pudieron cargar los turnos.");
  return (data ?? []) as TurnoProfesionalDetalle[];
}

export async function upsertShift(values: Partial<TurnoProfesional>) {
  const payload = {
    profesional_id: values.profesional_id,
    sede_id: values.sede_id,
    dia_semana: values.dia_semana,
    hora_inicio: values.es_descanso ? null : values.hora_inicio,
    hora_fin: values.es_descanso ? null : values.hora_fin,
    es_descanso: values.es_descanso ?? false,
    tolerancia_minutos: values.tolerancia_minutos ?? 10,
    vigente_desde: values.vigente_desde,
    vigente_hasta: values.vigente_hasta || null,
    activo: values.activo ?? true
  };
  const request = values.id
    ? db.from("turnos_profesionales").update(payload).eq("id", values.id)
    : db.from("turnos_profesionales").insert(payload);
  const { data, error } = await request.select("*").single();
  if (error) throw new Error(error.message ?? "No se pudo guardar el turno.");
  return data as TurnoProfesional;
}

export async function cancelShift(id: string) {
  const { data: shift, error: readError } = await db
    .from("turnos_profesionales")
    .select("vigente_desde")
    .eq("id", id)
    .single();
  if (readError) throw new Error(readError.message ?? "No se pudo verificar el turno.");
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(now);
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(now.getTime() - 86_400_000));
  const payload = shift.vigente_desde >= today
    ? { activo: false }
    : { vigente_hasta: yesterday };
  const { error } = await db.from("turnos_profesionales").update(payload).eq("id", id);
  if (error) throw new Error(error.message ?? "No se pudo cancelar el turno.");
}

export async function listProducts(includeInactive = false) {
  let query = db.from("productos").select("*").order("nombre");
  if (!includeInactive) query = query.eq("activo", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message ?? "No se pudieron cargar los productos.");
  return (data ?? []) as Producto[];
}

export async function upsertProduct(values: Partial<Producto>) {
  const payload = {
    nombre: values.nombre?.trim(),
    descripcion: values.descripcion?.trim() || null,
    sku: values.sku?.trim() || null,
    precio: Number(values.precio ?? 0),
    activo: values.activo ?? true
  };
  const request = values.id
    ? db.from("productos").update(payload).eq("id", values.id)
    : db.from("productos").insert(payload);
  const { data, error } = await request.select("*").single();
  if (error) throw new Error(error.message ?? "No se pudo guardar el producto.");
  return data as Producto;
}

export async function deactivateProduct(id: string) {
  const { error } = await db.from("productos").update({ activo: false }).eq("id", id);
  if (error) throw new Error(error.message ?? "No se pudo desactivar el producto.");
}

export function subscribeToAttendanceChanges(onChange: () => void) {
  const channel = supabase
    .channel(`bodyfeet-attendance-${Date.now()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "jornadas_asistencia" }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
