import { jsPDF } from "jspdf";
import type { HistoriaClinicaDetalle } from "../types/domain";
import { toReadableDateLong, toReadableTime } from "./date";
import { fullName } from "./format";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BRAND_BLUE = [94, 146, 219] as const;
const BRAND_DARK = [24, 50, 74] as const;
const BRAND_LIGHT = [234, 247, 251] as const;
const BORDER = [205, 226, 241] as const;
const MUTED = [86, 112, 132] as const;

function cleanClinicalValue(value?: string | null) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "";
  if (/^pendiente de (registrar|atencion)$/i.test(normalized)) return "";
  return normalized;
}

type PodologyRecord = NonNullable<
  NonNullable<HistoriaClinicaDetalle["cita"]>["expedientes_podologia"]
>[number];

function activePodologyRecord(history: HistoriaClinicaDetalle) {
  return history.cita?.expedientes_podologia?.find((record) => !record.eliminado) ?? null;
}

function readableValue(value?: string | null) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function pulseValue(value: boolean | null) {
  if (value === null) return "no evaluado";
  return value ? "presente" : "ausente";
}

function buildPodologyAntecedents(record: PodologyRecord | null) {
  if (!record) return "";
  const lines: string[] = [];
  const diseases = [...record.enfermedades, record.otra_enfermedad].filter(Boolean);
  if (diseases.length) lines.push(`Enfermedades o antecedentes: ${diseases.join(", ")}.`);
  if (record.alergias) lines.push(`Alergias: ${record.alergias}.`);
  return lines.join("\n");
}

function buildPodologyEvaluation(record: PodologyRecord | null) {
  if (!record) return "";
  const lines: string[] = [];
  if (record.pulso_pedio_izquierdo !== null || record.pulso_pedio_derecho !== null) {
    lines.push(`Pulso pedio: izquierdo ${pulseValue(record.pulso_pedio_izquierdo)}, derecho ${pulseValue(record.pulso_pedio_derecho)}.`);
  }
  if (record.pulso_tibial_izquierdo !== null || record.pulso_tibial_derecho !== null) {
    lines.push(`Pulso tibial: izquierdo ${pulseValue(record.pulso_tibial_izquierdo)}, derecho ${pulseValue(record.pulso_tibial_derecho)}.`);
  }
  if (record.temperatura) lines.push(`Temperatura: ${readableValue(record.temperatura)}.`);
  if (record.tipo_piel) lines.push(`Tipo de piel: ${readableValue(record.tipo_piel)}.`);
  if (record.formas_unas.length) lines.push(`Forma de unas: ${record.formas_unas.join(", ")}.`);
  if (record.alteraciones_unas) lines.push(`Alteraciones ungueales: ${record.alteraciones_unas}.`);
  const skinProblems = [...record.problemas_piel, record.otro_problema_piel].filter(Boolean);
  if (skinProblems.length) lines.push(`Problemas en la piel: ${skinProblems.join(", ")}.`);
  if (record.tipo_pie) lines.push(`Tipo de pie: ${readableValue(record.tipo_pie)}.`);
  if (record.mapa_anatomico_notas) lines.push(`Mapa anatomico: ${record.mapa_anatomico_notas}.`);
  return lines.join("\n");
}

function buildPodologyProcedures(record: PodologyRecord | null) {
  if (!record) return "";
  return [...record.tratamientos, record.otro_tratamiento].filter(Boolean).join(", ");
}

function calculateAge(birthDate?: string | null, referenceDate?: string | null) {
  if (!birthDate) return "";
  const birth = new Date(`${birthDate}T12:00:00`);
  const reference = referenceDate ? new Date(`${referenceDate}T12:00:00`) : new Date();
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime())) return "";
  let age = reference.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    reference.getMonth() < birth.getMonth() ||
    (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? String(age) : "";
}

function safeFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70);
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

function createFileName(history: HistoriaClinicaDetalle) {
  const patient = safeFilePart(fullName(history.paciente)) || "Paciente";
  const date = (history.cita?.fecha ?? history.created_at.slice(0, 10)).split("-").reverse().join("-");
  return `Historia_Clinica_${patient}_${date}.pdf`;
}

export async function createClinicalHistoryPdf(history: HistoriaClinicaDetalle) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const logo = await imageToDataUrl("/favicon.png");
  const attentionDate = history.cita?.fecha ?? history.created_at.slice(0, 10);
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
    doc.setFontSize(8);
    doc.text(continuation ? "Historia clinica - continuacion" : "Historia clinica", PAGE_WIDTH - MARGIN, 12, { align: "right" });
    doc.text(history.sede?.nombre ? `Sede ${history.sede.nombre}` : "Body Feet", PAGE_WIDTH - MARGIN, 18, { align: "right" });
    y = 43;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed <= PAGE_HEIGHT - 20) return;
    doc.addPage();
    drawHeader(true);
  };

  const writeInfoRow = (label: string, value: string, x: number, rowY: number, width: number) => {
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(label.toUpperCase(), x, rowY);
    doc.setTextColor(...BRAND_DARK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(value || "No registrado", width);
    doc.text(lines, x, rowY + 5);
  };

  const addSection = (title: string, value: string) => {
    const content = cleanClinicalValue(value);
    if (!content) return false;
    const lines = doc.splitTextToSize(content, CONTENT_WIDTH - 10);
    const height = Math.max(20, 13 + lines.length * 4.6);
    ensureSpace(height + 5);
    doc.setFillColor(...BRAND_LIGHT);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 2, 2, "FD");
    doc.setTextColor(...BRAND_BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(title.toUpperCase(), MARGIN + 5, y + 7);
    doc.setTextColor(...BRAND_DARK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(lines, MARGIN + 5, y + 13);
    y += height + 5;
    return true;
  };

  drawHeader();

  doc.setFillColor(247, 250, 252);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 26, 2, 2, "FD");
  writeInfoRow("Fecha de atencion", toReadableDateLong(attentionDate), MARGIN + 5, y + 7, 48);
  writeInfoRow("Hora", history.cita?.hora_inicio ? toReadableTime(history.cita.hora_inicio) : "No registrada", MARGIN + 60, y + 7, 28);
  writeInfoRow("Servicio", history.cita?.servicio?.nombre ?? "No registrado", MARGIN + 94, y + 7, 38);
  writeInfoRow("Profesional", fullName(history.profesional), MARGIN + 138, y + 7, 35);
  y += 34;

  doc.setTextColor(...BRAND_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Datos del paciente", MARGIN, y);
  y += 5;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 44, 2, 2, "FD");
  const age = calculateAge(history.paciente?.fecha_nacimiento, attentionDate);
  writeInfoRow("Paciente", fullName(history.paciente), MARGIN + 5, y + 7, 77);
  writeInfoRow("DNI", history.paciente?.dni ?? "No registrado", MARGIN + 94, y + 7, 35);
  writeInfoRow("Telefono", history.paciente?.telefono ?? "No registrado", MARGIN + 138, y + 7, 35);
  writeInfoRow("Nacimiento", history.paciente?.fecha_nacimiento ? toReadableDateLong(history.paciente.fecha_nacimiento) : "No registrada", MARGIN + 5, y + 27, 55);
  writeInfoRow("Edad", age ? `${age} anos` : "No registrada", MARGIN + 68, y + 27, 24);
  writeInfoRow("Direccion", history.paciente?.direccion ?? "No registrada", MARGIN + 101, y + 27, 72);
  y += 52;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Informacion clinica", MARGIN, y);
  y += 6;

  const podologyRecord = activePodologyRecord(history);
  const podologyAntecedents = buildPodologyAntecedents(podologyRecord);
  const podologyEvaluation = buildPodologyEvaluation(podologyRecord);
  const podologyProcedures = buildPodologyProcedures(podologyRecord);
  let sections = 0;
  if (addSection("Motivo de consulta", podologyRecord?.motivo_consulta || history.cita?.observaciones || "")) sections += 1;
  if (addSection("Antecedentes", podologyAntecedents)) sections += 1;
  if (addSection("Evaluacion", podologyEvaluation)) sections += 1;
  if (addSection("Diagnostico", cleanClinicalValue(history.diagnostico) || history.cita?.diagnostico || "")) sections += 1;
  if (addSection("Tratamiento realizado", cleanClinicalValue(history.tratamiento_realizado) || history.cita?.tratamiento || "")) sections += 1;
  if (addSection("Procedimientos podologicos", podologyProcedures)) sections += 1;
  if (addSection("Evolucion", history.evolucion ?? "")) sections += 1;
  if (addSection("Observaciones", podologyRecord?.observaciones || (podologyRecord ? history.cita?.observaciones : "") || "")) sections += 1;
  if (addSection("Recomendaciones e indicaciones", history.recomendaciones ?? "")) sections += 1;
  if (history.proxima_fecha_sugerida && addSection("Proxima cita sugerida", toReadableDateLong(history.proxima_fecha_sugerida))) sections += 1;

  if (!sections) {
    ensureSpace(24);
    doc.setFillColor(255, 248, 235);
    doc.setDrawColor(237, 190, 113);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 20, 2, 2, "FD");
    doc.setTextColor(132, 86, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text("Esta historia clinica esta pendiente de ser completada por el profesional.", MARGIN + 5, y + 12);
    y += 25;
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...BORDER);
    doc.line(MARGIN, PAGE_HEIGHT - 14, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 14);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("Documento clinico confidencial - Body Feet", MARGIN, PAGE_HEIGHT - 9);
    doc.text(`Pagina ${page} de ${pages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 9, { align: "right" });
  }

  return { doc, fileName: createFileName(history) };
}

export async function downloadClinicalHistoryPdf(history: HistoriaClinicaDetalle) {
  const { doc, fileName } = await createClinicalHistoryPdf(history);
  doc.save(fileName);
  return fileName;
}

export async function openClinicalHistoryPdf(history: HistoriaClinicaDetalle) {
  const { doc } = await createClinicalHistoryPdf(history);
  const url = URL.createObjectURL(doc.output("blob"));
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
