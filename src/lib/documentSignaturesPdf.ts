import type { jsPDF } from "jspdf";
import { toReadableDateLong } from "./date";
import { signatureToDataUrl } from "./signature";
import { listDocumentSignatures, type DocumentType } from "../services/signatures";

const SIGNER_LABELS = { paciente: "Paciente", profesional: "Profesional", responsable: "Responsable" } as const;

export async function appendDocumentSignaturesPage(doc: jsPDF, documentType: DocumentType, documentId: string, documentTitle: string) {
  let signatures;
  try {
    signatures = await listDocumentSignatures(documentType, documentId);
  } catch {
    return 0;
  }
  if (!signatures.length) return 0;

  doc.addPage();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = Math.max(14, width * 0.07);
  doc.setFillColor(24, 50, 74);
  doc.rect(0, 0, width, 31, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Firmas del documento", margin, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(documentTitle, margin, 22);

  let y = 43;
  for (const signature of signatures) {
    const blockHeight = 62;
    if (y + blockHeight > height - 18) {
      doc.addPage();
      y = 24;
    }
    doc.setDrawColor(205, 226, 241);
    doc.setFillColor(247, 250, 252);
    doc.roundedRect(margin, y, width - margin * 2, blockHeight - 5, 2, 2, "FD");
    const image = signatureToDataUrl(signature.trazos, 900, 280);
    doc.addImage(image, "PNG", margin + 6, y + 5, Math.min(78, width * 0.38), 25, undefined, "FAST");
    doc.setTextColor(24, 50, 74);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(signature.firmante_nombre, margin + 6, y + 38);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(86, 112, 132);
    doc.text(SIGNER_LABELS[signature.tipo_firmante], margin + 6, y + 44);
    doc.text("Firmado: " + toReadableDateLong(signature.firmado_at), margin + 6, y + 50);
    y += blockHeight;
  }
  return signatures.length;
}
