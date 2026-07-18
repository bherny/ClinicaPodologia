import { supabase } from "../lib/supabase";
import type { Perfil, Profesional, Sede, Servicio } from "../types/domain";

const db = supabase as any;

export async function listBranches(includeInactive = false) {
  let query = db.from("sedes").select("*").order("nombre");
  if (!includeInactive) query = query.eq("activo", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Sede[];
}

export async function listServices(includeInactive = false) {
  let query = db.from("servicios").select("*").order("nombre");
  if (!includeInactive) query = query.eq("activo", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Servicio[];
}

export async function listProfessionals(includeInactive = false) {
  let query = db.from("profesionales").select("*").order("apellidos");
  if (!includeInactive) query = query.eq("activo", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Profesional[];
}

export async function listProfiles() {
  const { data, error } = await db
    .from("perfiles")
    .select("*, sede:sedes(id,nombre)")
    .order("apellidos");
  if (error) throw error;
  return (data ?? []) as Array<Perfil & { sede?: Pick<Sede, "id" | "nombre"> | null }>;
}

export async function listServiceBranchIds(serviceId: string) {
  const { data, error } = await db.from("servicio_sede").select("sede_id").eq("servicio_id", serviceId);
  if (error) throw error;
  return (data ?? []).map((item: { sede_id: string }) => item.sede_id);
}

export async function listProfessionalBranchIds(professionalId: string) {
  const { data, error } = await db.from("profesional_sede").select("sede_id").eq("profesional_id", professionalId);
  if (error) throw error;
  return (data ?? []).map((item: { sede_id: string }) => item.sede_id);
}

export async function listProfessionalServiceIds(professionalId: string) {
  const { data, error } = await db.from("profesional_servicio").select("servicio_id").eq("profesional_id", professionalId);
  if (error) throw error;
  return (data ?? []).map((item: { servicio_id: string }) => item.servicio_id);
}

export async function saveServiceBranches(serviceId: string, branchIds: string[]) {
  const { error: deleteError } = await db.from("servicio_sede").delete().eq("servicio_id", serviceId);
  if (deleteError) throw deleteError;
  if (!branchIds.length) return;
  const { error } = await db.from("servicio_sede").insert(
    branchIds.map((sede_id) => ({
      servicio_id: serviceId,
      sede_id
    }))
  );
  if (error) throw error;
}

export async function saveProfessionalBranches(professionalId: string, branchIds: string[], horario = "") {
  const { error: deleteError } = await db.from("profesional_sede").delete().eq("profesional_id", professionalId);
  if (deleteError) throw deleteError;
  if (!branchIds.length) return;
  const { error } = await db.from("profesional_sede").insert(
    branchIds.map((sede_id) => ({
      profesional_id: professionalId,
      sede_id,
      horario_disponible: horario || null
    }))
  );
  if (error) throw error;
}

export async function saveProfessionalServices(professionalId: string, serviceIds: string[]) {
  const { error: deleteError } = await db.from("profesional_servicio").delete().eq("profesional_id", professionalId);
  if (deleteError) throw deleteError;
  if (!serviceIds.length) return;
  const { error } = await db.from("profesional_servicio").insert(
    serviceIds.map((servicio_id) => ({
      profesional_id: professionalId,
      servicio_id
    }))
  );
  if (error) throw error;
}
