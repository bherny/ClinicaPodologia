import { jsPDF } from "jspdf";
import type { ExpedientePodologiaDetalle } from "../types/domain";
import { fullName } from "./format";
import { appendDocumentSignaturesPage } from "./documentSignaturesPdf";

const PAGE_WIDTH = 215.9;
const PAGE_HEIGHT = 279.4;

function safeFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "paciente";
}

function calculateAge(birthDate?: string | null) {
  if (!birthDate) return "";
  const birth = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return String(Math.max(0, age));
}

async function imageToDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo cargar la plantilla del expediente.");
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer la plantilla del expediente."));
    reader.readAsDataURL(blob);
  });
}

function x(percent: number) {
  return PAGE_WIDTH * percent / 100;
}

function y(percent: number) {
  return PAGE_HEIGHT * percent / 100;
}

function textLine(doc: jsPDF, value: string | null | undefined, left: number, top: number, width: number, fontSize = 9, align: "left" | "center" = "left") {
  const clean = value?.trim() ?? "";
  if (!clean) return;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(20, 20, 20);
  const clipped = clean.length > 90 ? `${clean.slice(0, 87)}...` : clean;
  doc.text(clipped, align === "center" ? x(left + width / 2) : x(left), y(top) + 2.9, {
    align,
    maxWidth: x(width)
  });
}

function textBox(doc: jsPDF, value: string | null | undefined, left: number, top: number, width: number, height: number, fontSize = 7) {
  const clean = value?.trim() ?? "";
  if (!clean) return;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(20, 20, 20);
  const lines = doc.splitTextToSize(clean, x(width));
  const lineHeight = fontSize * 0.42;
  const maxLines = Math.max(1, Math.floor(y(height) / lineHeight));
  doc.text(lines.slice(0, maxLines), x(left), y(top) + 2.4, { lineHeightFactor: 1.15 });
}

function mark(doc: jsPDF, left: number, top: number, active: boolean, fontSize = 7) {
  if (!active) return;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.setTextColor(10, 10, 10);
  doc.text("X", x(left), y(top) + 0.8, { align: "center" });
}

function pair(doc: jsPDF, left: number, top: number, active: boolean, gap = 3.14) {
  mark(doc, left, top, active);
  mark(doc, left + gap, top, !active);
}

function rows(doc: jsPDF, values: string[], keys: string[], positions: number[], left: number, gap = 3.14) {
  keys.forEach((key, index) => pair(doc, left, positions[index], values.includes(key), gap));
}

function verticalPair(doc: jsPDF, left: number, yesTop: number, active: boolean) {
  mark(doc, left, active ? yesTop : yesTop + 1.04, true, 5.4);
}

function createFileName(record: ExpedientePodologiaDetalle) {
  return `expediente-podologico-${safeFilePart(fullName(record.paciente))}-${record.fecha}.pdf`;
}

export async function createPodologyPdf(record: ExpedientePodologiaDetalle) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter", compress: true });
  const template = await imageToDataUrl("/podology-expediente-template.png");
  doc.addImage(template, "PNG", 0, 0, PAGE_WIDTH, PAGE_HEIGHT, undefined, "FAST");

  doc.setFillColor(241, 237, 235);
  doc.rect(x(48.3), y(14.5), x(34), y(7.2), "F");

  textLine(doc, fullName(record.paciente), 13, 10.75, 35);
  textLine(doc, record.paciente?.direccion, 13, 13.55, 35);
  textLine(doc, calculateAge(record.paciente?.fecha_nacimiento), 13, 16.25, 10);
  textLine(doc, record.paciente?.dni, 13, 19.05, 20);
  textLine(doc, record.paciente?.telefono, 61.7, 13.55, 20);
  textLine(doc, record.fecha.split("-").reverse().join("/"), 83.1, 12.95, 12, 8, "center");
  textLine(doc, record.id.slice(0, 8).toUpperCase(), 83, 18.4, 13, 8);
  textBox(doc, record.motivo_consulta, 3.3, 26.05, 93, 4.1, 7);

  if (record.pulso_pedio_izquierdo !== null) pair(doc, 5.75, 37.7, record.pulso_pedio_izquierdo, 3.5);
  if (record.pulso_pedio_derecho !== null) pair(doc, 12.65, 37.7, record.pulso_pedio_derecho, 3.5);
  if (record.pulso_tibial_izquierdo !== null) pair(doc, 5.75, 43.75, record.pulso_tibial_izquierdo, 3.5);
  if (record.pulso_tibial_derecho !== null) pair(doc, 12.65, 43.75, record.pulso_tibial_derecho, 3.5);

  mark(doc, 5.73, 49.64, record.temperatura === "fria");
  mark(doc, 10.24, 49.64, record.temperatura === "normal");
  mark(doc, 15.14, 49.64, record.temperatura === "caliente");
  mark(doc, 5.69, 55.18, record.tipo_piel === "seca");
  mark(doc, 10.2, 55.18, record.tipo_piel === "grasa");
  mark(doc, 15.22, 55.18, record.tipo_piel === "mixta");

  rows(doc, record.enfermedades, ["diabetes", "hta", "artritis", "artrosis", "osteoporosis"], [40.15, 43.18, 46.03, 48.94, 51.91], 36.27);
  rows(doc, record.tratamientos, ["asepsia", "fomentacion", "limpieza_surcos", "onicotomia", "despiculizacion", "resecado", "helotomia", "desbastado", "pulido", "asepsia_final"], [39, 40.58, 42.06, 43.48, 45, 46.52, 48.09, 49.61, 51.12, 52.61], 88.31, 3.26);
  rows(doc, record.formas_unas, ["curva", "recta", "plana", "cuchara", "cucharada"], [62.8, 64.2, 65.6, 67, 68.4], 12.9, 4.3);

  verticalPair(doc, 75.61, 62.88, record.problemas_piel.includes("psoriasis"));
  verticalPair(doc, 84.99, 62.88, record.problemas_piel.includes("manchas"));
  verticalPair(doc, 94.3, 62.88, record.problemas_piel.includes("tina"));
  verticalPair(doc, 75.61, 65.72, record.problemas_piel.includes("vitiligo"));
  verticalPair(doc, 84.99, 65.72, record.problemas_piel.includes("verrugas"));
  verticalPair(doc, 94.3, 65.72, record.problemas_piel.includes("ampollas"));
  verticalPair(doc, 75.61, 68.61, record.problemas_piel.includes("cicatrices"));
  verticalPair(doc, 84.99, 68.61, record.problemas_piel.includes("dermatitis"));

  textBox(doc, record.otra_enfermedad, 32.9, 54.65, 27.6, 2.35);
  textBox(doc, record.otro_tratamiento, 67.2, 55.35, 24.8, 1.75);
  textBox(doc, record.alteraciones_unas, 30.2, 61.15, 33.7, 2.8);
  textBox(doc, record.alergias, 30.2, 66.6, 33.7, 2.8);
  textBox(doc, record.mapa_anatomico_notas, 2.3, 73.2, 53, 2.5, 5.8);

  mark(doc, 74.75, 77.65, record.tipo_pie === "romano");
  mark(doc, 92.9, 77.65, record.tipo_pie === "egipcio");
  mark(doc, 74.63, 88.35, record.tipo_pie === "griego");
  mark(doc, 93.38, 88.35, record.tipo_pie === "cuadrado");

  await appendDocumentSignaturesPage(doc, "expediente_podologico", record.id, "Expediente podologico - " + fullName(record.paciente));

  return { doc, fileName: createFileName(record) };
}

export async function downloadPodologyPdf(record: ExpedientePodologiaDetalle) {
  const { doc, fileName } = await createPodologyPdf(record);
  doc.save(fileName);
  return fileName;
}