import { supabase } from "../lib/supabase";

const db = supabase as any;

export type MusaCashSecurityStatus = {
  sede_id: string;
  configurado: boolean;
  autorizado: boolean;
  autorizado_hasta: string | null;
  bloqueado_hasta: string | null;
  intentos_restantes: number;
};

export type MusaCashPinResult = {
  exito: boolean;
  mensaje: string;
  autorizado_hasta: string | null;
  bloqueado_hasta: string | null;
  intentos_restantes: number;
};

export type MusaCashPinChangeResult = {
  exito: boolean;
  mensaje: string;
};

function securityError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (message.includes("schema cache") || message.includes("get_musa_cash") || message.includes("verify_musa_cash") || message.includes("change_musa_cash")) {
    return new Error("Falta aplicar la migracion 202608140003_musa_cash_security.sql en Supabase.");
  }
  return new Error(message || fallback);
}

function firstRow<T>(data: T[] | T | null): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

export async function getMusaCashSecurityStatus() {
  const { data, error } = await db.rpc("get_musa_cash_security_status");
  if (error) throw securityError(error, "No se pudo comprobar la seguridad de Caja Musa.");
  const status = firstRow<MusaCashSecurityStatus>(data);
  if (!status) throw new Error("No se recibio el estado de seguridad de Caja Musa.");
  return status;
}

export async function verifyMusaCashPin(pin: string) {
  const { data, error } = await db.rpc("verify_musa_cash_pin", { p_pin: pin });
  if (error) throw securityError(error, "No se pudo validar el PIN de Caja Musa.");
  const result = firstRow<MusaCashPinResult>(data);
  if (!result) throw new Error("No se recibio el resultado de validacion del PIN.");
  return result;
}

export async function lockMusaCashAccess() {
  const { error } = await db.rpc("lock_musa_cash_access");
  if (error) throw securityError(error, "No se pudo bloquear Caja Musa.");
}

export async function changeMusaCashPin(currentPin: string, newPin: string) {
  const { data, error } = await db.rpc("change_musa_cash_pin", {
    p_current_pin: currentPin,
    p_new_pin: newPin
  });
  if (error) throw securityError(error, "No se pudo actualizar el PIN de Caja Musa.");
  const result = firstRow<MusaCashPinChangeResult>(data);
  if (!result) throw new Error("No se recibio el resultado del cambio de PIN.");
  return result;
}