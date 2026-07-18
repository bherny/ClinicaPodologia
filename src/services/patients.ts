import { z } from "zod";
import { supabase } from "../lib/supabase";
import type { CitaDetalle, HistoriaClinica, Paciente, PacienteResumen, Recordatorio } from "../types/domain";

const db = supabase as any;

export const patientSchema = z.object({
  nombres: z.string().trim().min(2, "Ingresa los nombres"),
  apellidos: z.string().trim().min(2, "Ingresa los apellidos"),
  dni: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().regex(/^\d{8}$/, "El DNI debe tener 8 dígitos").optional().nullable()
  ),
  telefono: z.string().transform((value) => value.replace(/\D/g, "")).pipe(
    z.string().min(9, "Ingresa un teléfono válido").max(15, "El teléfono es demasiado largo")
  ),
  telefono_alternativo: z.string().optional().nullable(),
  fecha_nacimiento: z.string().optional().nullable(),
  sexo: z.enum(["femenino", "masculino", "otro", "no_indica"]).optional().nullable(),
  direccion: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  sede_de_registro_id: z.string().uuid("Selecciona una sede"),
  creado_por: z.string().uuid().optional().nullable()
});

export type PatientFormValues = z.infer<typeof patientSchema>;

export async function listPatients({
  search,
  branchId,
  page = 1,
  pageSize = 15
}: {
  search?: string;
  branchId?: string;
  page?: number;
  pageSize?: number;
}) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = db
    .from("pacientes")
    .select("*, sede:sedes(id,nombre)", { count: "exact" })
    .eq("eliminado", false)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (branchId && branchId !== "all") query = query.eq("sede_de_registro_id", branchId);
  if (search?.trim()) {
    const value = sanitizeFilterValue(search);
    if (!value) return { data: [], count: 0 };
    query = query.or(`nombres.ilike.%${value}%,apellidos.ilike.%${value}%,dni.ilike.%${value}%,telefono.ilike.%${value}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as PacienteResumen[], count: count ?? 0 };
}

export async function getPatient(id: string) {
  const { data, error } = await db
    .from("pacientes")
    .select("*, sede:sedes(id,nombre)")
    .eq("id", id)
    .eq("eliminado", false)
    .maybeSingle();
  if (error) throw error;
  return data as PacienteResumen | null;
}

export async function createPatient(values: PatientFormValues) {
  const duplicates = await findPossibleDuplicates(values);
  if (duplicates.length > 0) {
    throw new Error("Ya existe un paciente registrado con ese DNI.");
  }
  const { data, error } = await db.from("pacientes").insert(values).select("*").single();
  if (error) throw patientSaveError(error);
  return data as Paciente;
}

export async function updatePatient(id: string, values: PatientFormValues) {
  const duplicates = await findPossibleDuplicates(values, id);
  if (duplicates.length > 0) {
    throw new Error("Ya existe un paciente registrado con ese DNI.");
  }
  const { data, error } = await db.from("pacientes").update(values).eq("id", id).select("*").single();
  if (error) throw patientSaveError(error);
  return data as Paciente;
}

export async function softDeletePatient(id: string) {
  const { error } = await db.rpc("soft_delete_patient", { p_patient_id: id });
  if (error) throw new Error(error.message ?? "Supabase rechazo la eliminacion del paciente.");
}

export async function findPossibleDuplicates(values: Partial<PatientFormValues>, excludeId?: string) {
  const dni = values.dni?.trim();
  if (!dni) return [];

  let query = db
    .from("pacientes")
    .select("id,nombres,apellidos,dni,telefono")
    .eq("eliminado", false)
    .eq("dni", dni)
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Paciente[];
}

function patientSaveError(error: { code?: string; message?: string }) {
  if (error.code === "23505" && error.message?.includes("pacientes_dni_unico_idx")) {
    return new Error("Ya existe un paciente registrado con ese DNI.");
  }
  return new Error(error.message ?? "No se pudo guardar el paciente.");
}

function sanitizeFilterValue(value: string) {
  return value.replace(/[(),.%]/g, " ").replace(/\s+/g, " ").trim();
}

export async function getPatientAppointments(patientId: string) {
  const { data, error } = await db
    .from("citas")
    .select(
      "*, paciente:pacientes(id,nombres,apellidos,telefono,dni), sede:sedes(id,nombre,direccion,telefono), servicio:servicios(id,nombre,duracion_aproximada), profesional:profesionales(id,nombres,apellidos,especialidad), recordatorios(id,estado,fecha_envio,medio,mensaje)"
    )
    .eq("paciente_id", patientId)
    .eq("eliminado", false)
    .order("fecha", { ascending: false })
    .order("hora_inicio", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CitaDetalle[];
}

export async function getPatientClinicalHistory(patientId: string) {
  const { data, error } = await db
    .from("historias_clinicas")
    .select("*, sede:sedes(id,nombre), profesional:profesionales(id,nombres,apellidos)")
    .eq("paciente_id", patientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<HistoriaClinica & Record<string, any>>;
}

export async function getPatientReminders(patientId: string) {
  const { data, error } = await db
    .from("recordatorios")
    .select("*, cita:citas!inner(id,paciente_id,fecha,hora_inicio,servicio:servicios(nombre),sede:sedes(nombre))")
    .eq("cita.paciente_id", patientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<Recordatorio & Record<string, any>>;
}
