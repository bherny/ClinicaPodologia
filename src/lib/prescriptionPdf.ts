import { jsPDF } from "jspdf";
import type { RecetaDetalle } from "../types/domain";
import { toReadableDateLong } from "./date";
import { fullName } from "./format";
import { appendDocumentSignaturesPage } from "./documentSignaturesPdf";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BRAND_BLUE = [94, 146, 219] as const;
const BRAND_DARK = [24, 50, 74] as const;
const BRAND_LIGHT = [234, 247, 251] as const;
const BORDER = [205, 226, 241] as const;
const MUTED = [86, 112, 132] as const;

function safeFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70);
}

function clean(value?: string | null) {
  return value?.trim() ?? "";
}

async function imageToDataUrl(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function createFileName(prescription: RecetaDetalle) {
  const patient = safeFilePart(fullName(prescription.paciente)) || "Paciente";
  const date = prescription.fecha.split("-").reverse().join("-");
  return `Receta_${patient}_${date}.pdf`;
}

export async function createPrescriptionPdf(prescription: RecetaDetalle) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const logo = await imageToDataUrl("/favicon.png");
  let y = 0;

  const drawHeader = (continuation = false) => {
    doc.setFillColor(...BRAND_BLUE);
    doc.rect(0, 0, PAGE_WIDTH, 34, "F");
    if (logo) doc.addImage(logo, "PNG", MARGIN, 6, 22, 22);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("BODY FEET", logo ? 43 : MARGIN, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("PODOLOGIA Y REHABILITACION", logo ? 43 : MARGIN, 19);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(continuation ? "RECETA - CONTINUACION" : "RECETA", PAGE_WIDTH - MARGIN, 13, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(prescription.sede?.nombre ? `Sede ${prescription.sede.nombre}` : "Body Feet", PAGE_WIDTH - MARGIN, 19, { align: "right" });
    y = 43;
  };

  const addPage = () => {
    doc.addPage();
    drawHeader(true);
  };

  const ensureSpace = (needed: number) => {
    if (y + needed <= PAGE_HEIGHT - 20) return;
    addPage();
  };

  const writeInfo = (label: string, value: string, x: number, rowY: number, width: number) => {
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(label.toUpperCase(), x, rowY);
    doc.setTextColor(...BRAND_DARK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(doc.splitTextToSize(value || "No registrado", width), x, rowY + 5);
  };

  const addSection = (title: string, value: string) => {
    const content = clean(value);
    if (!content) return;
    const remaining = [...doc.splitTextToSize(content, CONTENT_WIDTH - 10)];
    let continuation = false;

    while (remaining.length) {
      if (PAGE_HEIGHT - 20 - y < 24) addPage();
      const availableLines = Math.max(1, Math.floor((PAGE_HEIGHT - 20 - y - 13) / 4.6));
      const lines = remaining.splice(0, availableLines);
      const height = Math.max(20, 13 + lines.length * 4.6);
      doc.setFillColor(...BRAND_LIGHT);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 2, 2, "FD");
      doc.setTextColor(...BRAND_BLUE);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(`${title.toUpperCase()}${continuation ? " - CONTINUACION" : ""}`, MARGIN + 5, y + 7);
      doc.setTextColor(...BRAND_DARK);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.text(lines, MARGIN + 5, y + 13);
      y += height + 5;
      continuation = true;
    }
  };

  drawHeader();

  doc.setFillColor(247, 250, 252);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 42, 2, 2, "FD");
  writeInfo("Paciente", fullName(prescription.paciente), MARGIN + 5, y + 7, 75);
  writeInfo("DNI", prescription.paciente?.dni ?? "No registrado", MARGIN + 91, y + 7, 34);
  writeInfo("Fecha", toReadableDateLong(prescription.fecha), MARGIN + 134, y + 7, 39);
  writeInfo("Profesional", fullName(prescription.profesional), MARGIN + 5, y + 27, 75);
  writeInfo("Especialidad", prescription.profesional?.especialidad ?? "No registrada", MARGIN + 91, y + 27, 39);
  writeInfo("Sede", prescription.sede?.nombre ?? "No registrada", MARGIN + 139, y + 27, 34);
  y += 50;

  if (prescription.diagnostico) addSection("Diagnostico", prescription.diagnostico);

  doc.setTextColor(...BRAND_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Medicamentos, tratamientos e indicaciones", MARGIN, y);
  y += 6;

  prescription.items.forEach((item, index) => {
    const details = [
      item.dosis ? `Dosis: ${item.dosis}` : "",
      item.frecuencia ? `Frecuencia: ${item.frecuencia}` : "",
      item.duracion ? `Duracion: ${item.duracion}` : "",
      item.via ? `Via: ${item.via}` : ""
    ].filter(Boolean);
    const content = [
      item.medicamento,
      details.join(" | "),
      item.indicaciones ? `Indicaciones: ${item.indicaciones}` : ""
    ].filter(Boolean).join("\n");
    addSection(`Indicacion ${index + 1}`, content);
  });

  if (prescription.indicaciones_generales) {
    addSection("Indicaciones generales", prescription.indicaciones_generales);
  }

  ensureSpace(28);
  y += 2;
  const signatureX = PAGE_WIDTH - MARGIN - 68;
  doc.setDrawColor(...MUTED);
  doc.line(signatureX, y + 15, PAGE_WIDTH - MARGIN, y + 15);
  doc.setTextColor(...BRAND_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(fullName(prescription.profesional), signatureX + 34, y + 21, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(prescription.profesional?.especialidad ?? "Profesional tratante", signatureX + 34, y + 26, { align: "center" });

  await appendDocumentSignaturesPage(doc, "receta", prescription.id, "Receta - " + fullName(prescription.paciente));

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...BORDER);
    doc.line(MARGIN, PAGE_HEIGHT - 14, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 14);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const contact = prescription.sede?.telefono ? ` - ${prescription.sede.telefono}` : "";
    doc.text(`Body Feet${contact}`, MARGIN, PAGE_HEIGHT - 9);
    doc.text(`Pagina ${page} de ${pages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 9, { align: "right" });
  }

  return { doc, fileName: createFileName(prescription) };
}

export async function downloadPrescriptionPdf(prescription: RecetaDetalle) {
  const { doc, fileName } = await createPrescriptionPdf(prescription);
  doc.save(fileName);
  return fileName;
}
