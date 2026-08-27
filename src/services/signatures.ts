import { supabase } from "../lib/supabase";
const db = supabase as any;
export type SignaturePoint = { x: number; y: number };
export type SignatureStroke = SignaturePoint[];
export type DocumentType = "historia_clinica" | "expediente_podologico" | "receta";
export type SignerType = "paciente" | "profesional" | "responsable";
export type DocumentSignature = {
  id: string; tipo_documento: DocumentType; documento_id: string; sede_id: string; paciente_id: string;
  tipo_firmante: SignerType; firmante_nombre: string; trazos: SignatureStroke[]; creado_por: string;
  firmado_at: string; updated_at: string;
};
function signatureError(error: { message?: string; code?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (/schema cache|PGRST202|PGRST205|does not exist/i.test(message)) return new Error("Activa la migracion 202608260001_signatures_and_team_communication.sql en Supabase.");
  if (/permission|row-level security|no tienes permiso/i.test(message)) return new Error("No tienes permiso para firmar este documento.");
  return new Error(message || fallback);
}
export async function listDocumentSignatures(documentType: DocumentType, documentId: string) {
  const { data, error } = await db.from("firmas_documentos").select("*").eq("tipo_documento", documentType).eq("documento_id", documentId).order("firmado_at", { ascending: true });
  if (error) throw signatureError(error, "No se pudieron cargar las firmas.");
  return (data ?? []) as DocumentSignature[];
}
export async function saveDocumentSignature(input: { documentType: DocumentType; documentId: string; signerType: SignerType; signerName: string; strokes: SignatureStroke[] }) {
  const { data, error } = await db.rpc("save_document_signature", {
    p_tipo_documento: input.documentType, p_documento_id: input.documentId, p_tipo_firmante: input.signerType,
    p_firmante_nombre: input.signerName.trim(), p_trazos: input.strokes
  });
  if (error) throw signatureError(error, "No se pudo guardar la firma.");
  return data as string;
}
export async function deleteDocumentSignature(signatureId: string) {
  const { error } = await db.rpc("delete_document_signature", { p_signature_id: signatureId });
  if (error) throw signatureError(error, "No se pudo eliminar la firma.");
}
