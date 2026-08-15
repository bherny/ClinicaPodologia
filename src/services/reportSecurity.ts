import { supabase } from "../lib/supabase";

const db = supabase as any;

export type MusaReportSecurityStatus = {
  sede_id: string;
  configurado: boolean;
  autorizado: boolean;
  autorizado_hasta: string | null;
  bloqueado_hasta: string | null;
  intentos_restantes: number;
};

export type MusaReportPinResult = {
  exito: boolean;
  mensaje: string;
  autorizado_hasta: string | null;
  bloqueado_hasta: string | null;
  intentos_restantes: number;
};

function reportSecurityError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (
    message.includes("schema cache")
    || message.includes("musa_report")
    || message.includes("reporte_musa")
  ) {
    return new Error("Falta aplicar la migracion 202608150004_musa_report_security.sql en Supabase.");
  }
  return new Error(message || fallback);
}

function firstRow<T>(data: T[] | T | null): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

export async function getMusaReportSecurityStatus() {
  const { data, error } = await db.rpc("get_musa_report_security_status");
  if (error) throw reportSecurityError(error, "No se pudo comprobar la seguridad de los reportes de Musa.");
  const status = firstRow<MusaReportSecurityStatus>(data);
  if (!status) throw new Error("No se recibio el estado de seguridad de los reportes de Musa.");
  return status;
}

export async function verifyMusaReportPin(pin: string) {
  const { data, error } = await db.rpc("verify_musa_report_pin", { p_pin: pin });
  if (error) throw reportSecurityError(error, "No se pudo validar el PIN de los reportes de Musa.");
  const result = firstRow<MusaReportPinResult>(data);
  if (!result) throw new Error("No se recibio el resultado de validacion del PIN.");
  return result;
}

export async function lockMusaReportAccess() {
  const { error } = await db.rpc("lock_musa_report_access");
  if (error) throw reportSecurityError(error, "No se pudieron bloquear los reportes de Musa.");
}