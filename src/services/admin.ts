import { supabase } from "../lib/supabase";
import type { Perfil, Profesional, Sede, Servicio } from "../types/domain";

const db = supabase as any;

export async function upsertBranch(values: Partial<Sede>) {
  const payload = {
    nombre: values.nombre,
    direccion: values.direccion ?? null,
    telefono: values.telefono ?? null,
    horario: values.horario ?? null,
    responsable_sede: values.responsable_sede ?? null,
    activo: values.activo ?? true
  };
  if (values.id) {
    const { data, error } = await db.from("sedes").update(payload).eq("id", values.id).select("*").single();
    if (error) throw error;
    return data as Sede;
  }
  const { data, error } = await db.from("sedes").insert(payload).select("*").single();
  if (error) throw error;
  return data as Sede;
}

export async function upsertService(values: Partial<Servicio>) {
  const payload = {
    nombre: values.nombre,
    descripcion: values.descripcion ?? null,
    duracion_aproximada: values.duracion_aproximada ?? 45,
    precio: values.precio ?? null,
    activo: values.activo ?? true
  };
  if (values.id) {
    const { data, error } = await db.from("servicios").update(payload).eq("id", values.id).select("*").single();
    if (error) throw error;
    return data as Servicio;
  }
  const { data, error } = await db.from("servicios").insert(payload).select("*").single();
  if (error) throw error;
  return data as Servicio;
}

export async function upsertProfessional(values: Partial<Profesional>) {
  const payload = {
    nombres: values.nombres,
    apellidos: values.apellidos,
    especialidad: values.especialidad ?? null,
    telefono: values.telefono ?? null,
    usuario_id: values.usuario_id ?? null,
    activo: values.activo ?? true
  };
  if (values.id) {
    const { data, error } = await db.from("profesionales").update(payload).eq("id", values.id).select("*").single();
    if (error) throw error;
    return data as Profesional;
  }
  const { data, error } = await db.from("profesionales").insert(payload).select("*").single();
  if (error) throw error;
  return data as Profesional;
}

export async function updateProfileAdmin(values: Partial<Perfil>) {
  const { data, error } = await db
    .from("perfiles")
    .update({
      nombres: values.nombres,
      apellidos: values.apellidos,
      telefono: values.telefono ?? null,
      rol: values.rol,
      sede_id: values.sede_id ?? null,
      activo: values.activo ?? true
    })
    .eq("id", values.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Perfil;
}

export async function softDeleteProfessional(id: string) {
  const { error } = await db.rpc("soft_delete_professional", { p_professional_id: id });
  if (error?.message?.includes("soft_delete_professional")) {
    throw new Error("La base de datos requiere la actualización acumulada. Ejecuta la migración 202607130005_repair_sales_actions.sql en Supabase.");
  }
  if (error) throw new Error(error.message ?? "No se pudo desactivar el profesional.");
}

export async function deactivateService(id: string) {
  const { error } = await db.from("servicios").update({ activo: false }).eq("id", id);
  if (error) throw new Error(error.message ?? "No se pudo desactivar el servicio.");
}

export async function deactivateBranch(id: string) {
  const { error } = await db.from("sedes").update({ activo: false }).eq("id", id);
  if (error) throw new Error(error.message ?? "No se pudo desactivar la sede.");
}

export async function listAudit() {
  const { data, error } = await db
    .from("auditoria")
    .select("*, usuario:perfiles(nombres,apellidos,correo)")
    .order("fecha", { ascending: false })
    .limit(80);
  if (error) throw error;
  return data ?? [];
}
