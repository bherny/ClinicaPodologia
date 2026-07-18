import { APPOINTMENT_STATUS_LABELS } from "../constants";
import { toReadableDateLong, toReadableTime } from "./date";
import { fullName } from "./format";
import type { CitaDetalle, ExpedientePodologiaDetalle, RecetaDetalle, VentaDetalle } from "../types/domain";

function escapeHtml(value?: string | null) {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function printAppointmentCard(cita: CitaDetalle) {
  const html = `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Tarjeta de cita Body Feet</title>
        <style>
          body { font-family: Manrope, Arial, sans-serif; color: #315470; margin: 0; padding: 28px; }
          .card { border: 1px solid #99D6E9; border-top: 6px solid #5E92DB; border-radius: 8px; padding: 24px; max-width: 560px; }
          img { width: 150px; margin-bottom: 18px; }
          h1 { font-size: 22px; margin: 0 0 16px; }
          dl { display: grid; grid-template-columns: 150px 1fr; gap: 8px 16px; }
          dt { font-weight: 800; color: #315470; }
          dd { margin: 0; }
          .note { margin-top: 18px; padding: 12px; background: #EAF7FB; border-left: 4px solid #CAA2DE; border-radius: 8px; }
        </style>
      </head>
      <body>
        <section class="card">
          <img src="/logo-body-feet.png" alt="Body Feet" />
          <h1>Tarjeta de cita</h1>
          <dl>
            <dt>Paciente</dt><dd>${fullName(cita.paciente)}</dd>
            <dt>Telefono</dt><dd>${cita.paciente?.telefono ?? ""}</dd>
            <dt>Sede</dt><dd>${cita.sede?.nombre ?? ""}</dd>
            <dt>Servicio</dt><dd>${cita.servicio?.nombre ?? ""}</dd>
            <dt>Profesional</dt><dd>${fullName(cita.profesional)}</dd>
            <dt>Fecha</dt><dd>${toReadableDateLong(cita.fecha)}</dd>
            <dt>Hora</dt><dd>${toReadableTime(cita.hora_inicio)} - ${toReadableTime(cita.hora_fin)}</dd>
            <dt>Estado</dt><dd>${APPOINTMENT_STATUS_LABELS[cita.estado]}</dd>
            <dt>Contacto</dt><dd>${cita.sede?.telefono ?? "Body Feet"}</dd>
          </dl>
          <div class="note"><strong>Indicaciones:</strong> ${cita.observaciones ?? "Llegar 10 minutos antes de la hora programada."}</div>
        </section>
        <script>window.print();</script>
      </body>
    </html>
  `;
  const popup = window.open("", "_blank", "width=720,height=760");
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
}

export function printPrescriptionLegacy(prescription: RecetaDetalle) {
  const items = prescription.items
    .map(
      (item, index) => `
        <section class="item">
          <div class="item-number">${index + 1}</div>
          <div>
            <h2>${escapeHtml(item.medicamento)}</h2>
            <p class="schedule">${[item.dosis, item.frecuencia, item.duracion, item.via]
              .filter(Boolean)
              .map((value) => escapeHtml(value))
              .join(" · ")}</p>
            ${item.indicaciones ? `<p>${escapeHtml(item.indicaciones)}</p>` : ""}
          </div>
        </section>`
    )
    .join("");

  const html = `<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Receta - ${escapeHtml(fullName(prescription.paciente))}</title>
        <style>
          @page { size: letter landscape; margin: 0; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #315470; font-family: Manrope, Arial, sans-serif; background: #fff; }
          .sheet { width: 11in; min-height: 8.5in; padding: .52in .65in .42in; position: relative; overflow: hidden; }
          .header { height: 1.15in; display: grid; grid-template-columns: .9in 1fr .9in; align-items: center; padding: .12in .22in; background: #5E92DB; color: #fff; }
          .mark { width: .78in; height: .78in; border-radius: 50%; }
          .mark:last-child { transform: scaleX(-1); justify-self: end; }
          .brand { text-align: center; }
          .brand h1 { margin: 0; font-size: 30pt; font-weight: 400; letter-spacing: .16em; }
          .brand p { margin: 4px 0 0; font-size: 11pt; font-weight: 700; }
          .meta { display: grid; grid-template-columns: 1fr auto; gap: 22px; margin: .34in .22in .18in; padding-bottom: 12px; border-bottom: 1px solid #99D6E9; }
          .meta strong { color: #315470; }
          .diagnosis { margin: 0 .22in .18in; color: #60798c; font-size: 10.5pt; }
          .content { min-height: 4.3in; padding: .08in .35in .72in; position: relative; }
          .watermark { position: absolute; width: 2.45in; opacity: .055; left: 50%; top: 48%; transform: translate(-50%, -50%); }
          .item { position: relative; z-index: 1; display: grid; grid-template-columns: 28px 1fr; gap: 10px; margin: 0 0 16px; page-break-inside: avoid; }
          .item-number { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: #EAF7FB; color: #315470; font-weight: 800; }
          .item h2 { margin: 0 0 3px; font-size: 12.5pt; }
          .item p { margin: 2px 0; font-size: 10.5pt; }
          .schedule { color: #416A91; font-weight: 700; }
          .general { position: relative; z-index: 1; margin-top: 18px; padding: 10px 12px; border-left: 4px solid #CAA2DE; background: #F6EFF9; font-size: 10pt; }
          .signature { position: absolute; right: .8in; bottom: .72in; width: 2.55in; padding-top: 7px; border-top: 1px solid #315470; text-align: center; font-size: 9pt; }
          .footer { position: absolute; left: .72in; right: .72in; bottom: .28in; display: grid; grid-template-columns: 1.4fr 1fr .8fr; gap: 12px; align-items: center; padding: 7px 14px; border-radius: 16px; background: #5E92DB; color: #fff; font-size: 8.5pt; }
          .footer span:last-child { text-align: right; }
        </style>
      </head>
      <body>
        <main class="sheet">
          <header class="header">
            <img class="mark" src="/favicon.png" alt="" />
            <div class="brand"><h1>BODY FEET</h1><p>CENTRO DE PODOLOGIA Y REHABILITACION</p></div>
            <img class="mark" src="/favicon.png" alt="" />
          </header>
          <div class="meta">
            <div><strong>Paciente:</strong> ${escapeHtml(fullName(prescription.paciente))}</div>
            <div><strong>Fecha:</strong> ${escapeHtml(toReadableDateLong(prescription.fecha))}</div>
          </div>
          ${prescription.diagnostico ? `<p class="diagnosis"><strong>Diagnostico:</strong> ${escapeHtml(prescription.diagnostico)}</p>` : ""}
          <section class="content">
            <img class="watermark" src="/favicon.png" alt="" />
            ${items}
            ${prescription.indicaciones_generales ? `<div class="general"><strong>Indicaciones generales:</strong> ${escapeHtml(prescription.indicaciones_generales)}</div>` : ""}
          </section>
          <div class="signature">
            <strong>${escapeHtml(fullName(prescription.profesional))}</strong><br />
            ${escapeHtml(prescription.profesional?.especialidad ?? "Profesional tratante")}
          </div>
          <footer class="footer">
            <span>${escapeHtml(prescription.sede?.direccion ?? `Sede ${prescription.sede?.nombre ?? "Body Feet"}`)}</span>
            <span>Body Feet - Podologia y Rehabilitacion</span>
            <span>${escapeHtml(prescription.sede?.telefono ?? "951 582 511")}</span>
          </footer>
        </main>
        <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
      </body>
    </html>`;

  const popup = window.open("", "_blank", "width=1100,height=850");
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
}

export function printPrescription(prescription: RecetaDetalle) {
  const items = prescription.items.map((item, index) => `
    <section class="rx-item">
      <span class="rx-number">${index + 1}.</span>
      <div>
        <strong>${escapeHtml(item.medicamento)}</strong>
        <span>${[item.dosis, item.frecuencia, item.duracion, item.via].filter(Boolean).map((value) => escapeHtml(value)).join(" - ")}</span>
        ${item.indicaciones ? `<span>${escapeHtml(item.indicaciones)}</span>` : ""}
      </div>
    </section>`).join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>Receta - ${escapeHtml(fullName(prescription.paciente))}</title><style>
    @page{size:letter landscape;margin:0}*{box-sizing:border-box}body{margin:0;color:#182c43;font-family:Arial,sans-serif;background:#fff}.rx-sheet{width:11in;height:8.5in;padding:.58in .4in .36in;position:relative;overflow:hidden}.rx-header{height:1.23in;display:grid;grid-template-columns:1.12in 1fr 1.12in;align-items:center;padding:.08in .12in;background:#7690c1;color:#fff}.rx-mark-wrap{height:100%;display:grid;place-items:center;overflow:hidden}.rx-mark{width:.92in;height:.92in;object-fit:cover;border-radius:8px}.rx-mark-wrap:last-child{transform:scaleX(-1)}.rx-brand{text-align:center}.rx-brand h1{margin:0;font-size:34pt;line-height:1;font-weight:300;letter-spacing:.2em}.rx-brand p{margin:9px 0 0;font-size:11.5pt;font-weight:800}.rx-meta{display:grid;grid-template-columns:1fr 2.45in;gap:.45in;margin:.36in .4in .05in;font-family:Georgia,serif;font-size:14pt;font-style:italic}.rx-meta-field{display:grid;grid-template-columns:auto 1fr;align-items:end;gap:8px}.rx-meta-value{min-height:25px;padding:0 4px 4px;border-bottom:1.5px dashed #182c43;font-family:Arial,sans-serif;font-size:11.5pt;font-style:normal;font-weight:700}.rx-content{height:4.45in;margin:.08in .45in 0;padding:.28in .22in .25in;position:relative;overflow:hidden}.rx-watermark{position:absolute;width:2.6in;opacity:.055;left:50%;top:49%;transform:translate(-50%,-50%)}.rx-items{position:relative;z-index:1;width:70%}.rx-item{display:grid;grid-template-columns:24px 1fr;gap:8px;margin-bottom:13px;page-break-inside:avoid;font-size:10.5pt;line-height:1.35}.rx-number{color:#7690c1;font-weight:800}.rx-item strong,.rx-item span{display:block}.rx-item strong{margin-bottom:2px;color:#182c43;font-size:11.5pt}.rx-item div span{color:#315470}.rx-general{position:relative;z-index:1;width:76%;margin-top:12px;padding-top:8px;border-top:1px solid #cfd9e9;color:#315470;font-size:9.5pt}.rx-professional{position:absolute;right:.58in;bottom:.76in;width:2.25in;padding-top:5px;border-top:1px solid #7690c1;text-align:center;color:#315470;font-size:8pt}.rx-footer-shadow{position:absolute;left:.52in;right:.52in;bottom:.27in;height:.39in;transform:translate(5px,5px);border-radius:20px;background:#9b9994}.rx-footer{position:absolute;left:.52in;right:.52in;bottom:.32in;min-height:.39in;display:grid;grid-template-columns:1.45fr 1.45fr .7fr;gap:12px;align-items:center;padding:7px 14px;border-radius:20px;background:#7690c1;color:#fff;font-size:8pt;font-weight:700}.rx-footer span:nth-child(2){text-align:center}.rx-footer span:last-child{text-align:right}
  </style></head><body><main class="rx-sheet"><header class="rx-header"><div class="rx-mark-wrap"><img class="rx-mark" src="/favicon.png" alt=""/></div><div class="rx-brand"><h1>BODY FEET</h1><p>CENTRO DE PODOLOGIA Y REHABILITACION</p></div><div class="rx-mark-wrap"><img class="rx-mark" src="/favicon.png" alt=""/></div></header><div class="rx-meta"><div class="rx-meta-field"><strong>Paciente:</strong><span class="rx-meta-value">${escapeHtml(fullName(prescription.paciente))}</span></div><div class="rx-meta-field"><strong>Fecha:</strong><span class="rx-meta-value">${escapeHtml(toReadableDateLong(prescription.fecha))}</span></div></div><section class="rx-content"><img class="rx-watermark" src="/favicon.png" alt=""/><div class="rx-items">${items}</div>${prescription.indicaciones_generales ? `<div class="rx-general"><strong>Indicaciones:</strong> ${escapeHtml(prescription.indicaciones_generales)}</div>` : ""}</section><div class="rx-professional"><strong>${escapeHtml(fullName(prescription.profesional))}</strong><br/>${escapeHtml(prescription.profesional?.especialidad ?? "Profesional tratante")}</div><div class="rx-footer-shadow"></div><footer class="rx-footer"><span>SEDE: ${escapeHtml(prescription.sede?.direccion ?? "Urb. Musa Calle los Azahares Mz 15 Lote 12, La Molina")}</span><span>BODY FEET - Centro de Podologia y Rehabilitacion</span><span>WHATSAPP ${escapeHtml(prescription.sede?.telefono ?? "951 582 511")}</span></footer></main><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`;
  openPrintWindow(html, 1120, 850);
}

function openPrintWindow(html: string, width = 900, height = 850) {
  const popup = window.open("", "_blank", `width=${width},height=${height}`);
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
}

export function printPodologyRecord(record: ExpedientePodologiaDetalle) {
  const list = (values: string[]) => values.length ? values.map((value) => escapeHtml(value.replace(/_/g, " "))).join(", ") : "Sin registrar";
  const yesNo = (value: boolean | null) => value ? "Presente" : "No registrado";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>Expediente podologico</title><style>
    @page { size: A4; margin: 12mm; } *{box-sizing:border-box} body{margin:0;font:10pt Arial,sans-serif;color:#315470} .sheet{padding:10px} header{display:flex;align-items:center;gap:18px;border-bottom:5px solid #5E92DB;padding-bottom:12px} header img{width:72px} h1{margin:0;font-size:24pt;color:#315470} h2{margin:18px 0 8px;padding:7px 10px;background:#5E92DB;color:#fff;font-size:11pt;text-transform:uppercase}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 18px}.full{grid-column:1/-1}.field{padding:7px 9px;border-bottom:1px solid #cfe4ee}.field strong{display:block;font-size:8pt;text-transform:uppercase;color:#60798c;margin-bottom:3px}.clinical{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.box{border:1px solid #cfe4ee;border-radius:6px;padding:10px;min-height:70px}.box strong{display:block;margin-bottom:6px}.signature{margin:40px 0 0 auto;width:240px;border-top:1px solid #315470;text-align:center;padding-top:6px}.footer{margin-top:22px;padding-top:8px;border-top:1px solid #99D6E9;text-align:center;font-size:8pt}
  </style></head><body><main class="sheet"><header><img src="/favicon.png" alt=""/><div><h1>Expediente podologico</h1><div>Body Feet - Centro de Podologia y Rehabilitacion</div></div></header>
  <h2>Datos generales</h2><div class="grid"><div class="field"><strong>Paciente</strong>${escapeHtml(fullName(record.paciente))}</div><div class="field"><strong>Fecha</strong>${escapeHtml(toReadableDateLong(record.fecha))}</div><div class="field"><strong>DNI</strong>${escapeHtml(record.paciente?.dni ?? "Sin registrar")}</div><div class="field"><strong>Telefono</strong>${escapeHtml(record.paciente?.telefono)}</div><div class="field"><strong>Sede</strong>${escapeHtml(record.sede?.nombre)}</div><div class="field"><strong>Profesional</strong>${escapeHtml(fullName(record.profesional))}</div><div class="field full"><strong>Motivo de consulta</strong>${escapeHtml(record.motivo_consulta)}</div></div>
  <h2>Evaluacion principal</h2><div class="clinical"><div class="box"><strong>Pulsos</strong>Pedio I: ${yesNo(record.pulso_pedio_izquierdo)}<br/>Pedio D: ${yesNo(record.pulso_pedio_derecho)}<br/>Tibial I: ${yesNo(record.pulso_tibial_izquierdo)}<br/>Tibial D: ${yesNo(record.pulso_tibial_derecho)}</div><div class="box"><strong>Piel</strong>Temperatura: ${escapeHtml(record.temperatura ?? "Sin registrar")}<br/>Tipo: ${escapeHtml(record.tipo_piel ?? "Sin registrar")}</div><div class="box"><strong>Tipo de pie</strong>${escapeHtml(record.tipo_pie ?? "Sin registrar")}</div></div>
  <h2>Antecedentes y tratamiento</h2><div class="grid"><div class="field"><strong>Enfermedades</strong>${list(record.enfermedades)}${record.otra_enfermedad ? `, ${escapeHtml(record.otra_enfermedad)}` : ""}</div><div class="field"><strong>Tratamientos</strong>${list(record.tratamientos)}${record.otro_tratamiento ? `, ${escapeHtml(record.otro_tratamiento)}` : ""}</div><div class="field"><strong>Forma de unas</strong>${list(record.formas_unas)}</div><div class="field"><strong>Problemas de piel</strong>${list(record.problemas_piel)}</div><div class="field"><strong>Alteraciones ungueales</strong>${escapeHtml(record.alteraciones_unas ?? "Sin registrar")}</div><div class="field"><strong>Alergias</strong>${escapeHtml(record.alergias ?? "Sin registrar")}</div><div class="field full"><strong>Mapa anatomico y hallazgos</strong>${escapeHtml(record.mapa_anatomico_notas ?? "Sin registrar")}</div><div class="field full"><strong>Observaciones</strong>${escapeHtml(record.observaciones ?? "Sin registrar")}</div></div>
  <div class="signature">${escapeHtml(fullName(record.profesional))}<br/>Profesional tratante</div><div class="footer">${escapeHtml(record.sede?.direccion ?? "Body Feet")} - ${escapeHtml(record.sede?.telefono ?? "")}</div></main><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`;
  openPrintWindow(html);
}

export function printSaleReceipt(sale: VentaDetalle) {
  const receipt = sale.comprobante;
  const rows = sale.items.map((item) => `<tr><td>${Number(item.cantidad).toFixed(2)}</td><td>${escapeHtml(item.descripcion)}</td><td>S/ ${Number(item.precio_unitario).toFixed(2)}</td><td>S/ ${Number(item.importe).toFixed(2)}</td></tr>`).join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>Constancia de venta Body Feet</title><style>
    @page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;font:10pt Arial,sans-serif;color:#315470}.sheet{padding:16px;border:1px solid #99D6E9}.head{display:grid;grid-template-columns:1fr 230px;gap:20px;align-items:start}.brand{display:flex;gap:14px;align-items:center}.brand img{width:74px}.brand h1{margin:0;font-size:22pt}.receipt{border:2px solid #315470;text-align:center}.receipt h2{margin:0;padding:10px;border-bottom:1px solid #315470;font-size:15pt}.number{padding:12px;font-size:14pt;font-weight:bold}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;margin:18px 0}.meta div{padding-bottom:6px;border-bottom:1px solid #d9eaf2}.meta strong{display:block;font-size:8pt;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:9px;border:1px solid #cfe4ee;text-align:left}th{background:#eaf7fb}.totals{width:310px;margin:14px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:5px}.totals .total{border-top:2px solid #315470;font-size:14pt;font-weight:bold}.footer{margin-top:28px;text-align:center;font-size:8pt}
  </style></head><body><main class="sheet"><div class="head"><div class="brand"><img src="/favicon.png" alt=""/><div><h1>BODY FEET</h1><div>Centro de Podologia y Rehabilitacion</div><p>${escapeHtml(sale.sede?.direccion ?? "")}<br/>${escapeHtml(sale.sede?.telefono ?? "")}</p></div></div><div class="receipt"><h2>CONSTANCIA DE VENTA</h2><div class="number">${escapeHtml(receipt ? `${receipt.serie}-${String(receipt.numero).padStart(8, "0")}` : sale.id.slice(0, 8).toUpperCase())}</div></div></div>
  <div class="meta"><div><strong>Cliente</strong>${escapeHtml(receipt?.cliente_nombre ?? fullName(sale.paciente))}</div><div><strong>Fecha</strong>${escapeHtml(toReadableDateLong(sale.fecha.slice(0,10)))}</div><div><strong>Documento</strong>${escapeHtml(receipt?.cliente_numero_documento ?? sale.paciente?.dni ?? "")}</div><div><strong>Medio de pago</strong>${escapeHtml(sale.metodo_pago)}</div><div><strong>Direccion</strong>${escapeHtml(receipt?.cliente_direccion ?? sale.paciente?.direccion ?? "")}</div><div><strong>Operacion</strong>${escapeHtml(sale.numero_operacion ?? "")}</div></div>
  <table><thead><tr><th>Cant.</th><th>Descripcion</th><th>P. unit.</th><th>Importe</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>Subtotal</span><span>S/ ${Number(sale.subtotal).toFixed(2)}</span></div><div><span>Descuento</span><span>S/ ${Number(sale.descuento).toFixed(2)}</span></div>${Number(sale.igv) > 0 ? `<div><span>Recargo</span><span>S/ ${Number(sale.igv).toFixed(2)}</span></div>` : ""}<div class="total"><span>Total</span><span>S/ ${Number(sale.total).toFixed(2)}</span></div></div><div class="footer">Gracias por su preferencia - Body Feet</div></main><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`;
  openPrintWindow(html);
}
