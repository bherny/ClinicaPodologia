import { addDays, format } from "date-fns";
import { supabase } from "../lib/supabase";
import { todayISO } from "../lib/date";
import type { CitaDetalle, EstadoCita, PacienteResumen } from "../types/domain";

const db = supabase as any;

const dashboardSelect =
  "*, paciente:pacientes(id,nombres,apellidos,telefono,dni), sede:sedes(id,nombre,direccion,telefono), servicio:servicios(id,nombre,duracion_aproximada), profesional:profesionales(id,nombres,apellidos,especialidad), recordatorios(id,estado,fecha_envio,medio,mensaje)";

export async function getDashboardData(branchId: string) {
  const today = todayISO();
  const nextWeek = format(addDays(new Date(), 7), "yyyy-MM-dd");

  let appointmentsQuery = db
    .from("citas")
    .select(dashboardSelect)
    .eq("eliminado", false)
    .gte("fecha", today)
    .lte("fecha", nextWeek)
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true });

  if (branchId !== "all") appointmentsQuery = appointmentsQuery.eq("sede_id", branchId);

  const { data: appointments, error: appointmentsError } = await appointmentsQuery;
  if (appointmentsError) throw appointmentsError;

  let newPatientsQuery = db
    .from("pacientes")
    .select("id", { count: "exact", head: true })
    .eq("eliminado", false)
    .gte("created_at", `${today}T00:00:00`);

  let totalPatientsQuery = db
    .from("pacientes")
    .select("id", { count: "exact", head: true })
    .eq("eliminado", false);

  let recentPatientsQuery = db
    .from("pacientes")
    .select("*, sede:sedes(id,nombre)")
    .eq("eliminado", false)
    .order("created_at", { ascending: false })
    .limit(5);

  if (branchId !== "all") {
    newPatientsQuery = newPatientsQuery.eq("sede_de_registro_id", branchId);
    totalPatientsQuery = totalPatientsQuery.eq("sede_de_registro_id", branchId);
    recentPatientsQuery = recentPatientsQuery.eq("sede_de_registro_id", branchId);
  }

  const [newPatientsResult, totalPatientsResult, recentPatientsResult] = await Promise.all([
    newPatientsQuery,
    totalPatientsQuery,
    recentPatientsQuery
  ]);
  if (newPatientsResult.error) throw newPatientsResult.error;
  if (totalPatientsResult.error) throw totalPatientsResult.error;
  if (recentPatientsResult.error) throw recentPatientsResult.error;

  const list = (appointments ?? []) as CitaDetalle[];
  const byStatus = list.reduce<Record<EstadoCita, number>>(
    (acc, appointment) => {
      acc[appointment.estado] += 1;
      return acc;
    },
    {
      pendiente: 0,
      confirmada: 0,
      atendida: 0,
      reprogramada: 0,
      cancelada: 0,
      no_asistio: 0
    }
  );

  const todayAppointments = list.filter((appointment) => appointment.fecha === today);
  const pendingReminders = list.filter((appointment) => {
    const reminders = appointment.recordatorios ?? [];
    const hasSent = reminders.some((reminder) =>
      ["enviado", "confirmado", "pendiente_respuesta"].includes(reminder.estado)
    );
    return ["pendiente", "confirmada"].includes(appointment.estado) && !hasSent;
  });

  return {
    appointments: list,
    todayAppointments,
    byStatus,
    pendingReminders,
    newPatientsCount: newPatientsResult.count ?? 0,
    totalPatientsCount: totalPatientsResult.count ?? 0,
    recentPatients: (recentPatientsResult.data ?? []) as PacienteResumen[]
  };
}
