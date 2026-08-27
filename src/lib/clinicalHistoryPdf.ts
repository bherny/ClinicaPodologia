import { jsPDF } from "jspdf";
import { normalizeClinicalEvaluation } from "../services/history";
import type { HistoriaClinicaDetalle, HistoriaClinicaEvaluacion } from "../types/domain";
import { toReadableDateLong } from "./date";
import { fullName } from "./format";
import { appendDocumentSignaturesPage } from "./documentSignaturesPdf";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BRAND_BLUE = [94, 146, 219] as const;
const BRAND_DARK = [24, 50, 74] as const;
const BORDER = [205, 226, 241] as const;
const MUTED = [86, 112, 132] as const;
const WHITE = [255, 255, 255] as const;
const FACTOR_LABELS: Record<string, string> = {
  flexionado: "Flexionado",
  derecho: "Derecho",
  sentado: "Sentado",
  de_pie: "De pie",
  sentarse: "Sentarse",
  levantarse: "Levantarse",
  quieto: "Quieto",
  movimiento: "Movimiento",
  am: "AM",
  conforme_pasa_dia: "Conforme pasa el dia",
  pm: "PM",
  caminando: "Caminando",
  tumbado: "Tumbado"
};

function clean(value?: string | null) {
  const normalized = value?.trim() ?? "";
  if (/^pendiente de (registrar|atencion)$/i.test(normalized)) return "";
  return normalized;
}

function choice(value?: string) {
  if (value === "si") return "Si";
  if (value === "no") return "No";
  if (value === "en_movimiento") return "En movimiento";
  if (value === "sin_cambios") return "Sin cambios";
  return value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ") : "";
}

function factorText(values: string[], other: string) {
  return [...values.map((value) => FACTOR_LABELS[value] ?? value), clean(other)].filter(Boolean).join(", ");
}

function calculateAge(birthDate?: string | null, referenceDate?: string | null) {
  if (!birthDate) return "";
  const birth = new Date(`${birthDate}T12:00:00`);
  const reference = new Date(`${referenceDate || new Date().toISOString().slice(0, 10)}T12:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime())) return "";
  let age = reference.getFullYear() - birth.getFullYear();
  if (
    reference.getMonth() < birth.getMonth() ||
    (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate())
  ) age -= 1;
  return age >= 0 ? `${age} anos` : "";
}

function patientSex(value?: string | null) {
  if (value === "femenino") return "Femenino";
  if (value === "masculino") return "Masculino";
  if (value === "otro") return "Otro";
  return "No indicado";
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
  const date = (history.fecha_evaluacion ?? history.cita?.fecha ?? history.created_at.slice(0, 10)).split("-").reverse().join("-");
  return `Historia_Clinica_${patient}_${date}.pdf`;
}

function hasDetailedEvaluation(evaluation: HistoriaClinicaEvaluacion) {
  return Object.entries(evaluation).some(([key, value]) => {
    if (key === "version" || value === false) return false;
    if (Array.isArray(value)) return value.some(Boolean);
    return Boolean(value);
  });
}

export async function createClinicalHistoryPdf(history: HistoriaClinicaDetalle) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const [logo, bodyMap] = await Promise.all([
    imageToDataUrl("/favicon.png"),
    imageToDataUrl("/clinical-body-map.jpg")
  ]);
  const evaluation = normalizeClinicalEvaluation(history.evaluacion);
  const attentionDate = history.fecha_evaluacion ?? history.cita?.fecha ?? history.created_at.slice(0, 10);
  let y = 0;
  let currentSection = "";

  const drawHeader = (continuation = false) => {
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, PAGE_WIDTH, 31, "F");
    if (logo) doc.addImage(logo, "PNG", MARGIN, 5, 21, 21);
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("HISTORIA CLINICA", logo ? 42 : MARGIN, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("BODY FEET · Centro de Podologia y Rehabilitacion", logo ? 42 : MARGIN, 18);
    doc.setFontSize(7.5);
    doc.text(continuation ? "Continuacion" : toReadableDateLong(attentionDate), PAGE_WIDTH - MARGIN, 12, { align: "right" });
    doc.text(history.sede?.nombre ? `Sede ${history.sede.nombre}` : "Body Feet", PAGE_WIDTH - MARGIN, 18, { align: "right" });
    y = 38;
  };

  const addPage = () => {
    doc.addPage();
    drawHeader(true);
    if (currentSection) drawSectionTitle(`${currentSection} · continuacion`);
  };

  const ensureSpace = (needed: number) => {
    if (y + needed <= PAGE_HEIGHT - 19) return;
    addPage();
  };

  const drawSectionTitle = (title: string) => {
    currentSection = title.replace(/ · continuacion$/, "");
    ensureSpace(11);
    doc.setFillColor(...BRAND_BLUE);
    doc.rect(MARGIN, y, CONTENT_WIDTH, 7.2, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.3);
    doc.text(title.toUpperCase(), MARGIN + 3, y + 5);
    y += 10;
  };

  const drawValueCell = (label: string, value: string, x: number, width: number, top: number, height: number) => {
    doc.setFillColor(249, 252, 254);
    doc.setDrawColor(...BORDER);
    doc.rect(x, top, width, height, "FD");
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.7);
    doc.text(label.toUpperCase(), x + 3, top + 4.2);
    doc.setTextColor(...BRAND_DARK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.3);
    const lines = doc.splitTextToSize(clean(value) || "No registrado", width - 6);
    doc.text(lines, x + 3, top + 8.7);
  };

  const addGridSection = (title: string, entries: Array<[string, string | null | undefined]>, columns = 2) => {
    drawSectionTitle(title);
    const cellWidth = CONTENT_WIDTH / columns;
    for (let index = 0; index < entries.length; index += columns) {
      const row = entries.slice(index, index + columns);
      const lineCounts = row.map(([label, value]) => {
        const lines = doc.splitTextToSize(clean(value) || "No registrado", cellWidth - 6);
        return Math.max(1, lines.length, doc.splitTextToSize(label.toUpperCase(), cellWidth - 6).length);
      });
      const rowHeight = Math.max(14, 9 + Math.max(...lineCounts) * 3.8);
      ensureSpace(rowHeight);
      row.forEach(([label, value], cellIndex) => drawValueCell(label, clean(value), MARGIN + cellIndex * cellWidth, cellWidth, y, rowHeight));
      if (row.length < columns) {
        for (let emptyIndex = row.length; emptyIndex < columns; emptyIndex += 1) {
          doc.setFillColor(249, 252, 254);
          doc.setDrawColor(...BORDER);
          doc.rect(MARGIN + emptyIndex * cellWidth, y, cellWidth, rowHeight, "FD");
        }
      }
      y += rowHeight;
    }
    y += 4;
  };

  const addParagraphSection = (title: string, value?: string | null) => {
    drawSectionTitle(title);
    const lines = doc.splitTextToSize(clean(value) || "Sin informacion registrada.", CONTENT_WIDTH - 8);
    let offset = 0;
    while (offset < lines.length) {
      const availableLines = Math.max(1, Math.floor((PAGE_HEIGHT - 21 - y) / 4.4));
      if (availableLines < 2) {
        addPage();
        continue;
      }
      const chunk = lines.slice(offset, offset + availableLines);
      const height = Math.max(15, 7 + chunk.length * 4.4);
      doc.setFillColor(249, 252, 254);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 1.5, 1.5, "FD");
      doc.setTextColor(...BRAND_DARK);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.7);
      doc.text(chunk, MARGIN + 4, y + 7);
      y += height + 4;
      offset += chunk.length;
    }
  };

  const addNumberedSection = (title: string, values: string[]) => {
    drawSectionTitle(title);
    const normalized = values.map(clean).filter(Boolean);
    if (!normalized.length) {
      ensureSpace(15);
      doc.setFillColor(249, 252, 254);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 14, 1.5, 1.5, "FD");
      doc.setTextColor(...MUTED);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.3);
      doc.text("Sin informacion registrada.", MARGIN + 4, y + 8);
      y += 18;
      return;
    }
    normalized.forEach((value, index) => {
      const lines = doc.splitTextToSize(value, CONTENT_WIDTH - 12);
      const height = Math.max(9, lines.length * 4.2 + 4);
      ensureSpace(height);
      doc.setTextColor(...BRAND_BLUE);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(`${index + 1}.`, MARGIN + 2, y + 5);
      doc.setTextColor(...BRAND_DARK);
      doc.setFont("helvetica", "normal");
      doc.text(lines, MARGIN + 9, y + 5);
      doc.setDrawColor(...BORDER);
      doc.line(MARGIN + 9, y + height - 1, PAGE_WIDTH - MARGIN, y + height - 1);
      y += height;
    });
    y += 4;
  };

  const addBodyMap = () => {
    drawSectionTitle("Localizacion del dolor");
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.6);
    doc.text("Zonas donde el paciente percibe los sintomas", MARGIN, y + 3);
    y += 6;
    const mapWidth = 96;
    const mapHeight = 98;
    ensureSpace(mapHeight + 8);
    const mapX = MARGIN;
    if (bodyMap) {
      doc.setDrawColor(...BORDER);
      doc.rect(mapX, y, mapWidth, mapHeight);
      doc.addImage(bodyMap, "JPEG", mapX + 1, y + 1, mapWidth - 2, mapHeight - 2);
      evaluation.localizacion_dolor_puntos.forEach((point) => {
        const pointX = mapX + 1 + (point.x / 100) * (mapWidth - 2);
        const pointY = y + 1 + (point.y / 100) * (mapHeight - 2);
        doc.setFillColor(202, 62, 69);
        doc.setDrawColor(...WHITE);
        doc.circle(pointX, pointY, 2.1, "FD");
      });
    } else {
      doc.setDrawColor(...BORDER);
      doc.rect(mapX, y, mapWidth, mapHeight);
      doc.setTextColor(...MUTED);
      doc.text("Esquema anatomico no disponible", mapX + mapWidth / 2, y + mapHeight / 2, { align: "center" });
    }
    const notesX = mapX + mapWidth + 6;
    const notesWidth = CONTENT_WIDTH - mapWidth - 6;
    doc.setFillColor(249, 252, 254);
    doc.setDrawColor(...BORDER);
    doc.rect(notesX, y, notesWidth, mapHeight, "FD");
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.7);
    doc.text("DESCRIPCION DE LA LOCALIZACION", notesX + 3, y + 5);
    doc.setTextColor(...BRAND_DARK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.3);
    const notes = doc.splitTextToSize(clean(evaluation.localizacion_dolor_notas) || "No registrada", notesWidth - 6);
    doc.text(notes.slice(0, 22), notesX + 3, y + 10);
    y += mapHeight + 5;
  };

  drawHeader();

  addGridSection("Datos personales", [
    ["Fecha", toReadableDateLong(attentionDate)],
    ["Sexo H/M", patientSex(history.paciente?.sexo)],
    ["Nombre", fullName(history.paciente)],
    ["Direccion", history.paciente?.direccion],
    ["Telefono", history.paciente?.telefono],
    ["Nacimiento", history.paciente?.fecha_nacimiento ? toReadableDateLong(history.paciente.fecha_nacimiento) : ""],
    ["Edad", calculateAge(history.paciente?.fecha_nacimiento, attentionDate)],
    ["Como nos ha conocido", evaluation.como_conocio],
    ["Sede", history.sede?.nombre],
    ["Profesional", fullName(history.profesional)]
  ]);

  addGridSection("Actividad laboral y fisica", [
    ["Actividad laboral", evaluation.actividad_laboral],
    ["Horas", evaluation.horas_laborales],
    ["Quieto / En movimiento", choice(evaluation.actividad_laboral_movimiento)],
    ["Baja laboral", choice(evaluation.baja_laboral)],
    ["Deporte / Actividad fisica / Ocio", evaluation.deporte_actividad_fisica_ocio],
    ["Horas / Dia", evaluation.horas_dia],
    ["Dias / Semana", evaluation.dias_semana],
    ["Cargas / Autocargas", evaluation.cargas_autocargas],
    ["Especificaciones", evaluation.especificaciones_actividad]
  ]);

  addParagraphSection("Motivo de consulta", evaluation.motivo_consulta || history.cita?.observaciones);

  addGridSection("Sintomas presentes", [
    ["Sintomas presentes", evaluation.sintomas_presentes],
    ["Presentes desde", evaluation.presentes_desde],
    ["Tras realizar", evaluation.tras_realizar],
    ["Comenzaron por", evaluation.sin_motivo ? "Sin motivo aparente" : evaluation.comenzaron_por],
    ["Donde comenzaron", evaluation.donde_comenzaron],
    ["Mejorando / Empeorando / Sin cambios", choice(evaluation.evolucion_sintomas)],
    ["Tiempo en aparecer", evaluation.tiempo_aparecer_sintomas],
    ["Episodio anterior", evaluation.episodio_anterior],
    ["Tratamiento anterior / actual", evaluation.tratamiento_anterior_actual],
    ["Sintomas constantes en", evaluation.sintomas_constantes],
    ["Sintomas intermitentes en", evaluation.sintomas_intermitentes],
    ["EVA", evaluation.eva ? `${evaluation.eva} / 10` : ""],
    ["El dolor impidio trabajar", choice(evaluation.dolor_impidio_trabajar)]
  ]);

  addBodyMap();

  addGridSection("Limitaciones", [
    ["Limitaciones", evaluation.limitaciones],
    ["Dolor nocturno", choice(evaluation.dolor_nocturno)],
    ["Dolor tos / estornudo / hacer fuerza", choice(evaluation.dolor_tos_estornudo_esfuerzo)],
    ["Marcha", choice(evaluation.marcha)],
    ["Continencia vesical / intestinal", choice(evaluation.continencia_vesical_intestinal)],
    ["Salud general / Comorbilidades", evaluation.salud_general_comorbilidades],
    ["Medicacion", evaluation.medicacion],
    ["Cirugia", evaluation.cirugia],
    ["Pruebas de imagen", evaluation.pruebas_imagen],
    ["Cambio de peso", evaluation.cambio_peso],
    ["Historial cancer", evaluation.historial_cancer],
    ["Historia trauma", evaluation.historia_trauma]
  ]);

  addGridSection("Peor", [["Factores", factorText(evaluation.peor, evaluation.peor_otro)]] , 1);
  addGridSection("Mejor", [["Factores", factorText(evaluation.mejor, evaluation.mejor_otro)]], 1);

  addGridSection("Preguntas clave", [
    ["A que le echa la culpa", evaluation.culpa_percibida],
    ["Que espera conseguir de esta visita", evaluation.expectativa_visita],
    ["Hay algo importante en el tintero", evaluation.informacion_importante]
  ], 1);

  addNumberedSection("Test", evaluation.tests);
  addParagraphSection("Reevaluacion", evaluation.reevaluacion || history.evolucion);
  addParagraphSection("Anotaciones", evaluation.anotaciones);
  addNumberedSection(
    "Hipotesis de diagnostico",
    evaluation.hipotesis_diagnostico.some(Boolean)
      ? evaluation.hipotesis_diagnostico
      : [clean(history.diagnostico)]
  );
  addParagraphSection("Trabajo para casa", evaluation.trabajo_casa || history.recomendaciones);
  addGridSection("Proxima sesion", [[
    "Fecha sugerida",
    history.proxima_fecha_sugerida ? toReadableDateLong(history.proxima_fecha_sugerida) : ""
  ]], 1);

  if (!hasDetailedEvaluation(evaluation)) {
    addGridSection("Registro clinico anterior", [
      ["Diagnostico", history.diagnostico],
      ["Tratamiento realizado", history.tratamiento_realizado],
      ["Evolucion", history.evolucion],
      ["Recomendaciones", history.recomendaciones]
    ]);
  }

  await appendDocumentSignaturesPage(doc, "historia_clinica", history.id, "Historia clinica - " + fullName(history.paciente));

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...BORDER);
    doc.line(MARGIN, PAGE_HEIGHT - 14, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 14);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.3);
    doc.text("Documento clinico confidencial · Body Feet", MARGIN, PAGE_HEIGHT - 9);
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