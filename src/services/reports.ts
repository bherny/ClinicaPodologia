import { supabase } from "../lib/supabase";
import {
  buildOperationalReport,
  type OperationalReport,
  type ReportAppointmentSource,
  type ReportBranchSource,
  type ReportMode,
  type ReportPatientSource,
  type ReportReminderSource,
  type ReportSaleSource
} from "../lib/reporting";
import type { EstadoCita, EstadoRecordatorio, EstadoVenta, MetodoPago } from "../types/domain";

const db = supabase as any;
const PAGE_SIZE = 1000;

type NamedRelation = { id: string; nombre: string };

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function isMusaBranchName(value: string) {
  return value.trim().toLocaleLowerCase("es-PE") === "musa";
}

async function fetchAll<T>(factory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const result = await factory(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message ?? "No se pudieron cargar los datos del reporte.");
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export async function getOperationalReport(
  branchId: string,
  mode: ReportMode,
  from: string,
  to: string
): Promise<OperationalReport> {
  const fromTimestamp = from + "T00:00:00";
  const toTimestamp = to + "T23:59:59.999";

  let branchesQuery = db.from("sedes").select("id,nombre").order("nombre");
  if (branchId !== "all") branchesQuery = branchesQuery.eq("id", branchId);
  const branchesResult = await branchesQuery;
  if (branchesResult.error) throw new Error(branchesResult.error.message ?? "No se pudieron cargar las sedes.");

  const branchRows = (branchesResult.data ?? []) as NamedRelation[];
  const musaBranchId = branchId === "all"
    ? branchRows.find((branch) => isMusaBranchName(branch.nombre))?.id ?? null
    : null;

  const [appointmentRows, patientRows, reminderRows, saleRows] = await Promise.all([
    fetchAll<any>((rangeFrom, rangeTo) => {
      let query = db
        .from("citas")
        .select("id,fecha,hora_inicio,estado,sede_id,sede:sedes(id,nombre),servicio:servicios(id,nombre)")
        .eq("eliminado", false)
        .gte("fecha", from)
        .lte("fecha", to)
        .order("fecha")
        .order("hora_inicio")
        .range(rangeFrom, rangeTo);
      if (branchId !== "all") query = query.eq("sede_id", branchId);
      else if (musaBranchId) query = query.neq("sede_id", musaBranchId);
      return query;
    }),
    fetchAll<any>((rangeFrom, rangeTo) => {
      let query = db
        .from("pacientes")
        .select("id,created_at,sede_de_registro_id,sede:sedes(id,nombre)")
        .eq("eliminado", false)
        .gte("created_at", fromTimestamp)
        .lte("created_at", toTimestamp)
        .order("created_at")
        .range(rangeFrom, rangeTo);
      if (branchId !== "all") query = query.eq("sede_de_registro_id", branchId);
      else if (musaBranchId) query = query.neq("sede_de_registro_id", musaBranchId);
      return query;
    }),
    fetchAll<any>((rangeFrom, rangeTo) => {
      let query = db
        .from("recordatorios")
        .select("id,cita_id,estado,cita:citas!inner(sede_id,fecha,eliminado)")
        .eq("cita.eliminado", false)
        .gte("cita.fecha", from)
        .lte("cita.fecha", to)
        .order("created_at")
        .range(rangeFrom, rangeTo);
      if (branchId !== "all") query = query.eq("cita.sede_id", branchId);
      else if (musaBranchId) query = query.neq("cita.sede_id", musaBranchId);
      return query;
    }),
    fetchAll<any>((rangeFrom, rangeTo) => {
      let query = db
        .from("ventas")
        .select("id,fecha,estado,metodo_pago,total,descuento,sede_id,sede:sedes(id,nombre)")
        .eq("eliminado", false)
        .gte("fecha", fromTimestamp)
        .lte("fecha", toTimestamp)
        .order("fecha")
        .range(rangeFrom, rangeTo);
      if (branchId !== "all") query = query.eq("sede_id", branchId);
      else if (musaBranchId) query = query.neq("sede_id", musaBranchId);
      return query;
    })
  ]);

  const visibleBranchRows = branchId === "all"
    ? branchRows.filter((branch) => !isMusaBranchName(branch.nombre))
    : branchRows;
  const branches: ReportBranchSource[] = visibleBranchRows.map((branch) => ({
    id: branch.id,
    name: branch.nombre
  }));

  const appointments: ReportAppointmentSource[] = appointmentRows.map((row) => {
    const branch = relationOne<NamedRelation>(row.sede);
    const service = relationOne<NamedRelation>(row.servicio);
    return {
      id: row.id,
      date: row.fecha,
      startTime: row.hora_inicio,
      status: row.estado as EstadoCita,
      branchId: row.sede_id,
      branchName: branch?.nombre ?? "Sede sin nombre",
      serviceName: service?.nombre ?? "Sin servicio"
    };
  });

  const patients: ReportPatientSource[] = patientRows.map((row) => {
    const branch = relationOne<NamedRelation>(row.sede);
    return {
      id: row.id,
      createdAt: row.created_at,
      branchId: row.sede_de_registro_id,
      branchName: branch?.nombre ?? "Sede sin nombre"
    };
  });

  const reminders: ReportReminderSource[] = reminderRows.map((row) => {
    const appointment = relationOne<{ sede_id: string }>(row.cita);
    return {
      id: row.id,
      appointmentId: row.cita_id,
      status: row.estado as EstadoRecordatorio,
      branchId: appointment?.sede_id ?? ""
    };
  });

  const sales: ReportSaleSource[] = saleRows.map((row) => {
    const branch = relationOne<NamedRelation>(row.sede);
    return {
      id: row.id,
      date: row.fecha,
      status: row.estado as EstadoVenta,
      paymentMethod: row.metodo_pago as MetodoPago,
      total: Number(row.total ?? 0),
      discount: Number(row.descuento ?? 0),
      branchId: row.sede_id,
      branchName: branch?.nombre ?? "Sede sin nombre"
    };
  });

  return buildOperationalReport({ branches, appointments, patients, reminders, sales }, mode, from, to);
}