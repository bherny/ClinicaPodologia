import { supabase } from "../lib/supabase";
import type { HistoriaClinicaDetalle, Paciente } from "../types/domain";

const db = supabase as any;
const PATIENT_PORTAL_TOKEN_KEY = "bodyfeet:patient-portal-token";

export type PatientPortalData =
  | {
      linked: true;
      patient: Paciente;
      histories: HistoriaClinicaDetalle[];
    }
  | {
      linked: false;
      reason: "not_found" | string;
    };

export type PatientPortalAccessStatus = {
  configured: boolean;
  active: boolean;
  blocked_until: string | null;
  updated_at: string | null;
};

type PatientPortalLoginResult = {
  success: boolean;
  message?: string;
  token?: string;
  expires_at?: string;
  attempts_remaining?: number;
  blocked_until?: string | null;
};

export function normalizePatientPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^9\d{8}$/.test(digits)) return digits;
  if (/^519\d{8}$/.test(digits)) return digits.slice(-9);
  if (/^\d{9,15}$/.test(digits)) return digits;
  throw new Error("Ingresa un celular valido. Para Peru usa 9 digitos, por ejemplo 999 999 999.");
}

function migrationError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (
    /login_patient_portal|get_patient_portal_by_token|configure_patient_portal_pin|schema cache|PGRST202/i.test(message)
  ) {
    return new Error("Falta aplicar la migracion 202608150002_patient_pin_portal.sql en Supabase.");
  }
  return new Error(message || fallback);
}

function getPatientPortalToken() {
  return sessionStorage.getItem(PATIENT_PORTAL_TOKEN_KEY);
}

export function hasPatientPortalSession() {
  return Boolean(getPatientPortalToken());
}

export function clearPatientPortalSession() {
  sessionStorage.removeItem(PATIENT_PORTAL_TOKEN_KEY);
}

export async function loginPatientPortal(phone: string, pin: string) {
  const normalizedPhone = normalizePatientPhone(phone);
  const normalizedPin = pin.replace(/\D/g, "");

  if (!/^\d{6,10}$/.test(normalizedPin)) {
    throw new Error("El PIN debe tener entre 6 y 10 digitos.");
  }

  const { data, error } = await db.rpc("login_patient_portal", {
    p_phone: normalizedPhone,
    p_pin: normalizedPin
  });

  if (error) throw migrationError(error, "No se pudo iniciar sesion en el portal.");
  const result = data as PatientPortalLoginResult;

  if (!result?.success || !result.token) {
    const suffix = typeof result?.attempts_remaining === "number" && result.attempts_remaining > 0
      ? ` Te quedan ${result.attempts_remaining} intentos.`
      : "";
    throw new Error(`${result?.message || "Telefono o PIN incorrecto."}${suffix}`);
  }

  sessionStorage.setItem(PATIENT_PORTAL_TOKEN_KEY, result.token);
  sessionStorage.removeItem("bodyfeet:session-expired");
  return result;
}

export async function getMyPatientPortal() {
  const token = getPatientPortalToken();
  if (!token) throw new Error("Ingresa nuevamente para consultar tu historial.");

  const { data, error } = await db.rpc("get_patient_portal_by_token", {
    p_token: token
  });

  if (error) {
    const nextError = migrationError(error, "No se pudo cargar tu historial clinico.");
    if (/sesion.*(vencio|invalida)|desactivado/i.test(nextError.message)) {
      clearPatientPortalSession();
    }
    throw nextError;
  }

  return data as PatientPortalData;
}

export async function recordPatientHistoryDownload(historyId: string, fileName: string) {
  const token = getPatientPortalToken();
  if (!token) throw new Error("La sesion del paciente vencio.");

  const { error } = await db.rpc("record_patient_history_download_by_token", {
    p_token: token,
    p_history_id: historyId,
    p_file_name: fileName
  });

  if (error) throw migrationError(error, "No se pudo registrar la descarga.");
}

export async function getPatientPortalAccessStatus(patientId: string) {
  const { data, error } = await db.rpc("get_patient_portal_access_status", {
    p_patient_id: patientId
  });
  if (error) throw migrationError(error, "No se pudo consultar el acceso del paciente.");
  return data as PatientPortalAccessStatus;
}

export async function configurePatientPortalPin(patientId: string, pin: string) {
  const normalizedPin = pin.replace(/\D/g, "");
  if (!/^\d{6,10}$/.test(normalizedPin)) {
    throw new Error("El PIN debe contener entre 6 y 10 digitos.");
  }

  const { data, error } = await db.rpc("configure_patient_portal_pin", {
    p_patient_id: patientId,
    p_pin: normalizedPin
  });
  if (error) throw migrationError(error, "No se pudo configurar el PIN del paciente.");
  return data as { success: boolean; message: string };
}

export async function revokePatientPortalAccess(patientId: string) {
  const { error } = await db.rpc("revoke_patient_portal_access", {
    p_patient_id: patientId
  });
  if (error) throw migrationError(error, "No se pudo desactivar el acceso del paciente.");
}
