import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Activity, ClipboardCheck, HeartPulse, ImagePlus, PenLine, Stethoscope } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { todayISO } from "../../lib/date";
import { fullName } from "../../lib/format";
import { queryClient } from "../../lib/queryClient";
import { createPhysiotherapySession, uploadClinicalPhoto, type PhysiotherapySessionInput } from "../../services/clinicalTimeline";
import type { HistoriaClinicaDetalle } from "../../types/domain";
import type { SignatureStroke } from "../../services/signatures";
import { Button } from "../ui/Button";
import { Field, Input, Select, Textarea } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { SignaturePad } from "../documents/SignaturePad";

const OBSERVATIONS = ["dolor", "rigidez", "tension", "debilidad", "limitacion_movimiento", "edema"] as const;
const TREATMENTS = ["compresa", "tens", "us", "magneto", "laser", "masaje", "movilizacion", "estiramiento", "ejercicios"] as const;
const LABELS: Record<string, string> = { dolor: "Dolor", rigidez: "Rigidez", tension: "Tensión", debilidad: "Debilidad", limitacion_movimiento: "Limitación de movimiento", edema: "Edema", compresa: "Compresa", tens: "TENS", us: "US", magneto: "Magneto", laser: "Láser", masaje: "Masaje", movilizacion: "Movilización", estiramiento: "Estiramiento", ejercicios: "Ejercicios" };

const emptySession: PhysiotherapySessionInput = {
  fecha: todayISO(), motivo_zona: "", diagnostico_medico: "", eva_inicial: null, eva_final: null, zona_dolor: "",
  observaciones_clinicas: [], observacion_otro: "", hallazgos: "", tratamientos: [], otro_tratamiento: "",
  ejercicios_dosificacion: "", evolucion: "", respuesta_paciente: "", indicaciones_proxima_sesion: "", tecnico_nombre: "", firma_trazos: []
};

export function PhysiotherapySessionModal({ history, onClose }: { history: HistoriaClinicaDetalle; onClose: () => void }) {
  const { profile } = useAuth();
  const [values, setValues] = useState<PhysiotherapySessionInput>(() => ({ ...emptySession, diagnostico_medico: history.diagnostico === "Pendiente de registrar" ? "" : history.diagnostico, tecnico_nombre: fullName(history.profesional) || fullName(profile) }));
  const [beforePhoto, setBeforePhoto] = useState<File | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null);
  const [error, setError] = useState("");
  const patientName = useMemo(() => fullName(history.paciente), [history.paciente]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("No se encontro el perfil activo.");
      if (values.eva_inicial !== null && (values.eva_inicial < 0 || values.eva_inicial > 10)) throw new Error("La EVA inicial debe estar entre 0 y 10.");
      if (values.eva_final !== null && (values.eva_final < 0 || values.eva_final > 10)) throw new Error("La EVA final debe estar entre 0 y 10.");
      const session = await createPhysiotherapySession(history, values, profile.id);
      const uploads: Promise<unknown>[] = [];
      if (beforePhoto) uploads.push(uploadClinicalPhoto({ history, sessionId: session.id, stage: "antes", takenAt: new Date().toISOString(), note: `Antes de la sesión ${session.numero_sesion}`, file: beforePhoto, profileId: profile.id }));
      if (afterPhoto) uploads.push(uploadClinicalPhoto({ history, sessionId: session.id, stage: "despues", takenAt: new Date().toISOString(), note: `Después de la sesión ${session.numero_sesion}`, file: afterPhoto, profileId: profile.id }));
      await Promise.all(uploads);
      return session;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clinical-timeline", history.id] });
      onClose();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "No se pudo guardar la sesion.")
  });

  const set = <K extends keyof PhysiotherapySessionInput>(key: K, value: PhysiotherapySessionInput[K]) => setValues((current) => ({ ...current, [key]: value }));
  const toggle = (key: "observaciones_clinicas" | "tratamientos", value: string) => set(key, values[key].includes(value) ? values[key].filter((item) => item !== value) : [...values[key], value]);

  return (
    <Modal title="Nueva sesión de fisioterapia" size="wide" onClose={onClose} footer={<><Button type="button" onClick={onClose}>Cancelar</Button><Button form="physiotherapy-session-form" type="submit" variant="primary" disabled={mutation.isPending}>{mutation.isPending ? "Guardando..." : "Guardar sesión"}</Button></>}>
      <form id="physiotherapy-session-form" className="clinical-session-form" onSubmit={(event) => { event.preventDefault(); setError(""); mutation.mutate(); }}>
        {error ? <div className="alert alert--warning">{error}</div> : null}
        <section className="clinical-session-section"><header><ClipboardCheck /><h3>Datos de la sesión</h3></header><div className="clinical-form-grid clinical-form-grid--three">
          <Field label="Fecha"><Input type="date" required value={values.fecha} onChange={(event) => set("fecha", event.target.value)} /></Field>
          <Field label="Paciente"><Input readOnly value={patientName} /></Field>
          <Field label="Teléfono"><Input readOnly value={history.paciente?.telefono ?? ""} /></Field>
        </div><div className="clinical-form-grid clinical-form-grid--two">
          <Field label="Motivo / zona"><Input value={values.motivo_zona} onChange={(event) => set("motivo_zona", event.target.value)} /></Field>
          <Field label="Diagnóstico médico"><Input value={values.diagnostico_medico} onChange={(event) => set("diagnostico_medico", event.target.value)} /></Field>
        </div></section>

        <section className="clinical-session-section"><header><HeartPulse /><h3>Dolor y observación</h3></header><div className="clinical-form-grid clinical-form-grid--three">
          <Field label="EVA inicial / 10"><Input type="number" min="0" max="10" value={values.eva_inicial ?? ""} onChange={(event) => set("eva_inicial", event.target.value === "" ? null : Number(event.target.value))} /></Field>
          <Field label="EVA final / 10"><Input type="number" min="0" max="10" value={values.eva_final ?? ""} onChange={(event) => set("eva_final", event.target.value === "" ? null : Number(event.target.value))} /></Field>
          <Field label="Zona"><Input value={values.zona_dolor} onChange={(event) => set("zona_dolor", event.target.value)} /></Field>
        </div><div className="clinical-check-grid">{OBSERVATIONS.map((item) => <label className="clinical-check" key={item}><input type="checkbox" checked={values.observaciones_clinicas.includes(item)} onChange={() => toggle("observaciones_clinicas", item)} /><span>{LABELS[item]}</span></label>)}</div>
          <Field label="Otra observación"><Input value={values.observacion_otro} onChange={(event) => set("observacion_otro", event.target.value)} /></Field>
          <Field label="Hallazgos"><Textarea rows={3} value={values.hallazgos} onChange={(event) => set("hallazgos", event.target.value)} /></Field>
        </section>

        <section className="clinical-session-section"><header><Stethoscope /><h3>Tratamiento realizado</h3></header><div className="clinical-check-grid">{TREATMENTS.map((item) => <label className="clinical-check" key={item}><input type="checkbox" checked={values.tratamientos.includes(item)} onChange={() => toggle("tratamientos", item)} /><span>{LABELS[item]}</span></label>)}</div>
          <Field label="Otro tratamiento"><Input value={values.otro_tratamiento} onChange={(event) => set("otro_tratamiento", event.target.value)} /></Field>
          <Field label="Ejercicios / dosificación"><Textarea rows={3} value={values.ejercicios_dosificacion} onChange={(event) => set("ejercicios_dosificacion", event.target.value)} /></Field>
        </section>

        <section className="clinical-session-section"><header><Activity /><h3>Evolución</h3></header><div className="clinical-form-grid clinical-form-grid--three">
          <Field label="Resultado"><Select value={values.evolucion} onChange={(event) => set("evolucion", event.target.value as PhysiotherapySessionInput["evolucion"])}><option value="">No indicado</option><option value="mejoro">Mejoró</option><option value="igual">Igual</option><option value="empeoro">Empeoró</option></Select></Field>
          <Field label="Respuesta del paciente"><Input value={values.respuesta_paciente} onChange={(event) => set("respuesta_paciente", event.target.value)} /></Field>
          <Field label="Indicaciones / próxima sesión"><Input value={values.indicaciones_proxima_sesion} onChange={(event) => set("indicaciones_proxima_sesion", event.target.value)} /></Field>
        </div></section>

        <section className="clinical-session-section"><header><ImagePlus /><h3>Fotos opcionales de esta sesión</h3></header><div className="clinical-form-grid clinical-form-grid--two">
          <Field label="Antes"><Input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setBeforePhoto(event.target.files?.[0] ?? null)} /></Field>
          <Field label="Después"><Input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setAfterPhoto(event.target.files?.[0] ?? null)} /></Field>
        </div><small>Son opcionales. También podrás agregar fotos de seguimiento en cualquier momento desde la línea de tiempo.</small></section>

        <section className="clinical-session-section"><header><PenLine /><h3>Técnico y firma</h3></header>
          <Field label="Técnico"><Input value={values.tecnico_nombre} onChange={(event) => set("tecnico_nombre", event.target.value)} /></Field>
          <SignaturePad value={values.firma_trazos} onChange={(strokes: SignatureStroke[]) => set("firma_trazos", strokes)} />
        </section>
      </form>
    </Modal>
  );
}
