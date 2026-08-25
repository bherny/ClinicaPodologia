import { Activity, BriefcaseBusiness, ClipboardCheck, ClipboardList, HeartPulse, House, Stethoscope, UserRound } from "lucide-react";
import { toReadableDateLong } from "../../lib/date";
import { fullName } from "../../lib/format";
import { normalizeClinicalEvaluation } from "../../services/history";
import type { HistoriaClinicaDetalle } from "../../types/domain";
import { BodyPainMap } from "./BodyPainMap";

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
  conforme_pasa_dia: "Conforme pasa el día",
  pm: "PM",
  caminando: "Caminando",
  tumbado: "Tumbado"
};

function clean(value?: string | null) {
  const normalized = value?.trim() ?? "";
  return /^pendiente de (registrar|atencion)$/i.test(normalized) ? "" : normalized;
}

function choice(value?: string) {
  if (value === "si") return "Sí";
  if (value === "no") return "No";
  if (value === "en_movimiento") return "En movimiento";
  if (value === "sin_cambios") return "Sin cambios";
  if (value === "de_pie") return "De pie";
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function factors(values: string[], other: string) {
  return [...values.map((value) => FACTOR_LABELS[value] ?? value), clean(other)].filter(Boolean).join(", ");
}

export function ClinicalHistoryEvaluationView({ history }: { history: HistoriaClinicaDetalle }) {
  const evaluation = normalizeClinicalEvaluation(history.evaluacion);
  const hypotheses = evaluation.hipotesis_diagnostico.filter(Boolean);
  const tests = evaluation.tests.filter(Boolean);
  const attentionDate = history.fecha_evaluacion ?? history.cita?.fecha ?? history.created_at.slice(0, 10);
  const symptoms = [
    ["Síntomas presentes", evaluation.sintomas_presentes],
    ["Presentes desde", evaluation.presentes_desde],
    ["Tras realizar", evaluation.tras_realizar],
    ["Comenzaron por", evaluation.sin_motivo ? "Sin motivo aparente" : evaluation.comenzaron_por],
    ["¿Dónde comenzaron?", evaluation.donde_comenzaron],
    ["Evolución", choice(evaluation.evolucion_sintomas)],
    ["Tiempo en aparecer", evaluation.tiempo_aparecer_sintomas],
    ["Episodio anterior", evaluation.episodio_anterior],
    ["Tratamiento anterior / actual", evaluation.tratamiento_anterior_actual],
    ["Síntomas constantes", evaluation.sintomas_constantes],
    ["Síntomas intermitentes", evaluation.sintomas_intermitentes],
    ["EVA", evaluation.eva ? `${evaluation.eva} / 10` : ""],
    ["¿Impidió trabajar?", choice(evaluation.dolor_impidio_trabajar)]
  ] as const;
  const limitations = [
    ["Limitaciones", evaluation.limitaciones],
    ["Dolor nocturno", choice(evaluation.dolor_nocturno)],
    ["Dolor al toser, estornudar o hacer fuerza", choice(evaluation.dolor_tos_estornudo_esfuerzo)],
    ["Marcha", choice(evaluation.marcha)],
    ["Continencia vesical / intestinal", choice(evaluation.continencia_vesical_intestinal)],
    ["Salud general / Comorbilidades", evaluation.salud_general_comorbilidades],
    ["Medicación", evaluation.medicacion],
    ["Cirugía", evaluation.cirugia],
    ["Pruebas de imagen", evaluation.pruebas_imagen],
    ["Cambio de peso", evaluation.cambio_peso],
    ["Historial cáncer", evaluation.historial_cancer],
    ["Historia trauma", evaluation.historia_trauma]
  ] as const;

  return (
    <article className="clinical-record">
      <header className="clinical-form-brand clinical-form-brand--compact">
        <img src="/favicon.png" alt="Body Feet" />
        <div>
          <span>Body Feet · Centro de Podología y Rehabilitación</span>
          <h2>Historia clínica</h2>
          <p>{toReadableDateLong(attentionDate)}</p>
        </div>
      </header>

      <section className="clinical-record-summary">
        <RecordDatum label="Paciente" value={fullName(history.paciente)} />
        <RecordDatum label="DNI" value={history.paciente?.dni} />
        <RecordDatum label="Teléfono" value={history.paciente?.telefono} />
        <RecordDatum label="Dirección" value={history.paciente?.direccion} />
        <RecordDatum label="Sede" value={history.sede?.nombre} />
        <RecordDatum label="Profesional" value={fullName(history.profesional)} />
      </section>

      <DisplaySection icon={<UserRound />} title="Datos personales">
        <DataGrid entries={[
          ["¿Cómo nos ha conocido?", evaluation.como_conocio],
          ["Servicio", history.cita?.servicio?.nombre ?? ""],
          ["Fecha de evaluación", toReadableDateLong(attentionDate)]
        ]} />
      </DisplaySection>

      <DisplaySection icon={<BriefcaseBusiness />} title="Actividad laboral y física">
        <DataGrid entries={[
          ["Actividad laboral", evaluation.actividad_laboral],
          ["Horas", evaluation.horas_laborales],
          ["Tipo de actividad", choice(evaluation.actividad_laboral_movimiento)],
          ["Baja laboral", choice(evaluation.baja_laboral)],
          ["Deporte / Actividad física / Ocio", evaluation.deporte_actividad_fisica_ocio],
          ["Horas / Día", evaluation.horas_dia],
          ["Días / Semana", evaluation.dias_semana],
          ["Cargas / Autocargas", evaluation.cargas_autocargas],
          ["Especificaciones", evaluation.especificaciones_actividad]
        ]} />
      </DisplaySection>

      <DisplaySection icon={<ClipboardList />} title="Motivo de consulta">
        <ClinicalParagraph value={evaluation.motivo_consulta || history.cita?.observaciones} />
      </DisplaySection>

      <DisplaySection icon={<HeartPulse />} title="Síntomas presentes">
        <DataGrid entries={symptoms} />
      </DisplaySection>

      <DisplaySection icon={<Activity />} title="Localización del dolor">
        {evaluation.localizacion_dolor_puntos.length ? (
          <BodyPainMap points={evaluation.localizacion_dolor_puntos} readOnly />
        ) : null}
        <ClinicalParagraph value={evaluation.localizacion_dolor_notas} />
      </DisplaySection>

      <DisplaySection icon={<Stethoscope />} title="Limitaciones">
        <DataGrid entries={limitations} />
      </DisplaySection>

      <DisplaySection icon={<Activity />} title="Peor / Mejor">
        <DataGrid entries={[
          ["Peor", factors(evaluation.peor, evaluation.peor_otro)],
          ["Mejor", factors(evaluation.mejor, evaluation.mejor_otro)]
        ]} />
      </DisplaySection>

      <DisplaySection icon={<ClipboardCheck />} title="Preguntas clave">
        <DataGrid entries={[
          ["¿A qué le echa la culpa?", evaluation.culpa_percibida],
          ["¿Qué espera conseguir de esta visita?", evaluation.expectativa_visita],
          ["¿Hay algo importante en el tintero?", evaluation.informacion_importante]
        ]} />
      </DisplaySection>

      {tests.length ? (
        <DisplaySection icon={<ClipboardList />} title="Test">
          <NumberedValues values={tests} />
        </DisplaySection>
      ) : null}

      <DisplaySection icon={<Stethoscope />} title="Reevaluación">
        <ClinicalParagraph value={evaluation.reevaluacion || history.evolucion} />
      </DisplaySection>

      <DisplaySection icon={<ClipboardList />} title="Anotaciones">
        <ClinicalParagraph value={evaluation.anotaciones} />
      </DisplaySection>

      <DisplaySection icon={<HeartPulse />} title="Hipótesis de diagnóstico">
        <NumberedValues values={hypotheses.length ? hypotheses : [clean(history.diagnostico)].filter(Boolean)} />
      </DisplaySection>

      {clean(history.tratamiento_realizado) ? (
        <DisplaySection icon={<Stethoscope />} title="Tratamiento realizado">
          <ClinicalParagraph value={history.tratamiento_realizado} />
        </DisplaySection>
      ) : null}

      <DisplaySection icon={<House />} title="Trabajo para casa">
        <ClinicalParagraph value={evaluation.trabajo_casa || history.recomendaciones} />
        {history.proxima_fecha_sugerida ? (
          <DataGrid entries={[["Próxima sesión", toReadableDateLong(history.proxima_fecha_sugerida)]]} />
        ) : null}
      </DisplaySection>
    </article>
  );
}

function DisplaySection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="clinical-record-section">
      <header><span>{icon}</span><h3>{title}</h3></header>
      <div>{children}</div>
    </section>
  );
}

function DataGrid({ entries }: { entries: ReadonlyArray<readonly [string, string | null | undefined]> }) {
  const visible = entries.filter(([, value]) => clean(value));
  if (!visible.length) return <p className="clinical-record-empty">Sin información registrada.</p>;
  return (
    <dl className="clinical-record-grid">
      {visible.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

function ClinicalParagraph({ value }: { value?: string | null }) {
  const normalized = clean(value);
  return <p className={normalized ? "clinical-record-text" : "clinical-record-empty"}>{normalized || "Sin información registrada."}</p>;
}

function NumberedValues({ values }: { values: string[] }) {
  if (!values.length) return <p className="clinical-record-empty">Sin información registrada.</p>;
  return <ol className="clinical-record-list">{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ol>;
}

function RecordDatum({ label, value }: { label: string; value?: string | null }) {
  return <div><span>{label}</span><strong>{value || "No registrado"}</strong></div>;
}