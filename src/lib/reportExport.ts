import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { downloadCsv } from "./csv";
import type { OperationalReport } from "./reporting";

function currency(value: number) {
  return value.toLocaleString("es-PE", { style: "currency", currency: "PEN" });
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function reportPeriodLabel(report: OperationalReport) {
  if (report.mode === "daily") {
    return format(parseISO(report.from), "d 'de' MMMM 'de' yyyy", { locale: es });
  }
  return format(parseISO(report.from), "MMMM 'de' yyyy", { locale: es });
}

export function downloadOperationalReportCsv(report: OperationalReport, branchLabel: string) {
  const total = report.summary;
  const rows = report.branchBreakdown.map((row) => ({
    SEDE: row.branchName,
    CITAS: row.appointments,
    ATENDIDAS: row.attended,
    CONFIRMADAS: row.confirmed,
    "CANCELADAS O NO ASISTIO": row.cancelled,
    "PACIENTES NUEVOS": row.newPatients,
    "RECORDATORIOS PENDIENTES": row.pendingReminders,
    VENTAS: row.sales,
    "INGRESOS S/": row.revenue.toFixed(2)
  }));

  rows.push({
    SEDE: branchLabel,
    CITAS: total.appointments,
    ATENDIDAS: total.attended,
    CONFIRMADAS: total.confirmed,
    "CANCELADAS O NO ASISTIO": total.cancelled,
    "PACIENTES NUEVOS": total.newPatients,
    "RECORDATORIOS PENDIENTES": total.pendingReminders,
    VENTAS: total.sales,
    "INGRESOS S/": total.revenue.toFixed(2)
  });

  const period = report.mode === "daily" ? report.from : report.from.slice(0, 7);
  downloadCsv("body-feet-reporte-" + period + ".csv", rows);
}

export async function downloadOperationalReportPdf(report: OperationalReport, branchLabel: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const summary = report.summary;

  doc.setFillColor(11, 69, 92);
  doc.rect(0, 0, pageWidth, 31, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("BODY FEET", margin, 13);
  doc.setFontSize(12);
  doc.text("Reporte operativo", margin, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(reportPeriodLabel(report), pageWidth - margin, 13, { align: "right" });
  doc.text(branchLabel, pageWidth - margin, 20, { align: "right" });

  const metrics = [
    ["Citas", String(summary.appointments)],
    ["Atendidas", String(summary.attended)],
    ["Pacientes nuevos", String(summary.newPatients)],
    ["Recordatorios pendientes", String(summary.pendingReminders)],
    ["Ventas pagadas", String(summary.sales)],
    ["Ingresos", currency(summary.revenue)]
  ];
  const metricGap = 3;
  const metricWidth = (contentWidth - metricGap * 5) / 6;
  let x = margin;
  let y = 38;
  metrics.forEach(([label, value]) => {
    doc.setFillColor(247, 250, 252);
    doc.setDrawColor(216, 229, 237);
    doc.roundedRect(x, y, metricWidth, 22, 2, 2, "FD");
    doc.setTextColor(96, 121, 140);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.text(label.toUpperCase(), x + 3, y + 7);
    doc.setTextColor(24, 50, 74);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(value, x + 3, y + 16);
    x += metricWidth + metricGap;
  });

  const renderPanel = (title: string, items: Array<{ label: string; value: string }>, panelX: number) => {
    const width = (contentWidth - 8) / 3;
    doc.setDrawColor(216, 229, 237);
    doc.roundedRect(panelX, 66, width, 42, 2, 2, "S");
    doc.setTextColor(49, 84, 112);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(title, panelX + 3, 73);
    doc.setFontSize(7);
    items.slice(0, 5).forEach((item, index) => {
      const itemY = 80 + index * 5;
      doc.setFont("helvetica", "normal");
      doc.text(doc.splitTextToSize(item.label, width - 29)[0], panelX + 3, itemY);
      doc.setFont("helvetica", "bold");
      doc.text(item.value, panelX + width - 3, itemY, { align: "right" });
    });
  };

  renderPanel("Citas por estado", report.statusBreakdown.map((item) => ({ label: item.label, value: String(item.value) })), margin);
  renderPanel("Servicios mas solicitados", report.serviceBreakdown.map((item) => ({ label: item.label, value: String(item.value) })), margin + (contentWidth - 8) / 3 + 4);
  renderPanel("Ingresos por medio de pago", report.paymentBreakdown.map((item) => ({ label: item.label, value: currency(item.amount ?? 0) })), margin + ((contentWidth - 8) / 3 + 4) * 2);

  y = 116;
  const headers = ["Sede", "Citas", "Atend.", "Conf.", "Cancel./N.A.", "Nuevos", "Record. pend.", "Ventas", "Ingresos"];
  const widths = [47, 19, 21, 20, 30, 25, 34, 20, 35];
  doc.setFillColor(234, 247, 251);
  doc.rect(margin, y, contentWidth, 9, "F");
  doc.setTextColor(49, 84, 112);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  let columnX = margin;
  headers.forEach((header, index) => {
    doc.text(header, columnX + 2, y + 6);
    columnX += widths[index];
  });
  y += 9;

  doc.setFont("helvetica", "normal");
  report.branchBreakdown.forEach((row) => {
    const values = [
      row.branchName,
      String(row.appointments),
      String(row.attended),
      String(row.confirmed),
      String(row.cancelled),
      String(row.newPatients),
      String(row.pendingReminders),
      String(row.sales),
      currency(row.revenue)
    ];
    doc.setDrawColor(216, 229, 237);
    doc.line(margin, y + 8, pageWidth - margin, y + 8);
    doc.setTextColor(24, 50, 74);
    columnX = margin;
    values.forEach((value, index) => {
      doc.text(doc.splitTextToSize(value, widths[index] - 4)[0], columnX + 2, y + 5.5);
      columnX += widths[index];
    });
    y += 8;
  });

  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`Ticket promedio: ${currency(summary.averageTicket)}`, margin, y);
  doc.text(`Descuentos: ${currency(summary.discounts)}`, margin + 70, y);
  doc.text(`Asistencia: ${summary.attendanceRate.toFixed(1)}%`, margin + 135, y);
  doc.text(`Cancelacion: ${summary.cancellationRate.toFixed(1)}%`, margin + 195, y);
  doc.setTextColor(96, 121, 140);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Generado: ${new Date(report.generatedAt).toLocaleString("es-PE")}`, pageWidth - margin, 198, { align: "right" });

  const period = report.mode === "daily" ? report.from : report.from.slice(0, 7);
  doc.save(`body-feet-reporte-${period}.pdf`);
}
export function printOperationalReport(report: OperationalReport, branchLabel: string) {
  const popup = window.open("", "body-feet-operational-report", "width=1100,height=800");
  if (!popup) throw new Error("El navegador bloqueo la ventana de impresion.");

  const summary = report.summary;
  const branchRows = report.branchBreakdown.map((row) =>
    "<tr><td>" + escapeHtml(row.branchName) + "</td><td>" + row.appointments + "</td><td>" + row.attended +
    "</td><td>" + row.confirmed + "</td><td>" + row.cancelled + "</td><td>" + row.newPatients +
    "</td><td>" + row.pendingReminders + "</td><td>" + row.sales + "</td><td>" + escapeHtml(currency(row.revenue)) + "</td></tr>"
  ).join("");

  const statuses = report.statusBreakdown.map((item) =>
    "<li><span>" + escapeHtml(item.label) + "</span><strong>" + item.value + "</strong></li>"
  ).join("");

  const services = report.serviceBreakdown.map((item) =>
    "<li><span>" + escapeHtml(item.label) + "</span><strong>" + item.value + "</strong></li>"
  ).join("");

  const payments = report.paymentBreakdown.map((item) =>
    "<li><span>" + escapeHtml(item.label) + "</span><strong>" + escapeHtml(currency(item.amount ?? 0)) + "</strong></li>"
  ).join("");

  const html = [
    "<!doctype html><html lang='es'><head><meta charset='utf-8'><title>Reporte Body Feet</title>",
    "<style>",
    "@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#18324a;margin:0}",
    "header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #5e92db;padding-bottom:12px;margin-bottom:18px}",
    "header img{width:64px;height:64px;object-fit:contain}h1{font-size:24px;margin:0 0 4px}p{margin:2px 0;color:#60798c;font-size:12px}",
    ".metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:16px}.metric{border:1px solid #d8e5ed;padding:10px;border-radius:6px}",
    ".metric span{display:block;color:#60798c;font-size:9px;text-transform:uppercase}.metric strong{display:block;font-size:19px;margin-top:4px}",
    ".grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}.panel{border:1px solid #d8e5ed;border-radius:6px;padding:10px}",
    ".panel h2{font-size:12px;margin:0 0 8px}.panel ul{list-style:none;padding:0;margin:0}.panel li{display:flex;justify-content:space-between;border-top:1px solid #edf3f7;padding:5px 0;font-size:10px}",
    "table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid #d8e5ed;padding:6px;text-align:right}th{background:#edf4fd;color:#315470}",
    "th:first-child,td:first-child{text-align:left}.footer{margin-top:10px;text-align:right;color:#60798c;font-size:9px}",
    "</style></head><body>",
    "<header><div><h1>Reporte operativo Body Feet</h1><p>" + escapeHtml(reportPeriodLabel(report)) + " | " + escapeHtml(branchLabel) +
      "</p><p>Informacion consolidada de citas, pacientes, recordatorios y caja.</p></div><img src='/logo-body-feet-4k.png' alt='Body Feet'></header>",
    "<section class='metrics'>",
    "<div class='metric'><span>Citas</span><strong>" + summary.appointments + "</strong></div>",
    "<div class='metric'><span>Atendidas</span><strong>" + summary.attended + "</strong></div>",
    "<div class='metric'><span>Pacientes nuevos</span><strong>" + summary.newPatients + "</strong></div>",
    "<div class='metric'><span>Recordatorios pendientes</span><strong>" + summary.pendingReminders + "</strong></div>",
    "<div class='metric'><span>Ventas</span><strong>" + summary.sales + "</strong></div>",
    "<div class='metric'><span>Ingresos</span><strong>" + escapeHtml(currency(summary.revenue)) + "</strong></div>",
    "</section>",
    "<section class='grid'><div class='panel'><h2>Citas por estado</h2><ul>" + statuses +
      "</ul></div><div class='panel'><h2>Servicios mas solicitados</h2><ul>" + (services || "<li>Sin actividad</li>") +
      "</ul></div><div class='panel'><h2>Ingresos por medio de pago</h2><ul>" + (payments || "<li>Sin ventas</li>") + "</ul></div></section>",
    "<table><thead><tr><th>Sede</th><th>Citas</th><th>Atendidas</th><th>Confirmadas</th><th>Canceladas / no asistio</th>",
    "<th>Pacientes nuevos</th><th>Recordatorios pendientes</th><th>Ventas</th><th>Ingresos</th></tr></thead><tbody>",
    branchRows,
    "</tbody></table><div class='footer'>Generado el " + escapeHtml(new Date(report.generatedAt).toLocaleString("es-PE")) + "</div>",
    "<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>"
  ].join("");

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}