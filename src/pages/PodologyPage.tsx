import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardPlus, Printer, Sparkles, Trash2 } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { TableSkeleton } from "../components/ui/Skeleton";
import { useBranch } from "../context/BranchContext";
import { todayISO, toReadableDate } from "../lib/date";
import { fullName } from "../lib/format";
import { printPodologyRecord } from "../lib/print";
import { queryClient } from "../lib/queryClient";
import { listProfessionals } from "../services/catalog";
import { listPatients } from "../services/patients";
import { createPodologyRecord, listPodologyAppointments, listPodologyRecords, podologyRecordSchema, softDeletePodologyRecord, type PodologyRecordFormValues } from "../services/podology";

const DISEASES = [["diabetes", "Diabetes"], ["hta", "HTA"], ["artritis", "Artritis"], ["artrosis", "Artrosis"], ["osteoporosis", "Osteoporosis"]] as const;
const TREATMENTS = [["asepsia", "Asepsia"], ["fomentacion", "Fomentacion"], ["limpieza_surcos", "Limpieza de surcos"], ["onicotomia", "Onicotomia"], ["despiculizacion", "Despiculizacion"], ["resecado", "Resecado"], ["helotomia", "Helotomia"], ["desbastado", "Desbastado"], ["pulido", "Pulido"], ["asepsia_final", "Asepsia final"]] as const;
const TREATMENT_LABELS = Object.fromEntries(TREATMENTS) as Record<string, string>;
const NAIL_SHAPES = [["curva", "Curva"], ["recta", "Recta"], ["plana", "Plana"], ["cuchara", "Cuchara"], ["cucharada", "Cucharada"]] as const;
const SKIN_PROBLEMS = [["psoriasis", "Psoriasis"], ["manchas", "Manchas"], ["tina", "Tina"], ["vitiligo", "Vitiligo"], ["verrugas", "Verrugas"], ["ampollas", "Ampollas"], ["cicatrices", "Cicatrices"], ["dermatitis", "Dermatitis"]] as const;

export function PodologyPage() {
  const { selectedBranchId, branches } = useBranch();
  const [open, setOpen] = useState(false);
  const recordsQuery = useQuery({ queryKey: ["podology-records", selectedBranchId], queryFn: () => listPodologyRecords(selectedBranchId) });
  const rows = recordsQuery.data ?? [];
  const deleteMutation = useMutation({
    mutationFn: softDeletePodologyRecord,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["podology-records"] })
  });

  return (
    <main className="page">
      <PageHeader
        eyebrow="Podologia"
        title="Expedientes podologicos"
        description="Evaluacion vascular, ungueal, cutanea y anatomica vinculada al historial permanente del paciente."
        action={<Button type="button" variant="primary" onClick={() => setOpen(true)}><ClipboardPlus /> Nueva evaluacion</Button>}
      />
      {recordsQuery.error ? <div className="alert">{recordsQuery.error instanceof Error ? recordsQuery.error.message : "No se pudieron cargar los expedientes"}</div> : null}
      {deleteMutation.error ? <div className="alert">{deleteMutation.error instanceof Error ? deleteMutation.error.message : "No se pudo eliminar el expediente"}</div> : null}
      <Card>
        {recordsQuery.isLoading ? <TableSkeleton /> : rows.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Fecha</th><th>Paciente</th><th>Motivo</th><th>Hallazgos</th><th>Profesional</th><th>Sede</th><th>Acciones</th></tr></thead>
            <tbody>{rows.map((record) => <tr key={record.id}>
              <td data-label="Fecha"><strong>{toReadableDate(record.fecha)}</strong></td>
              <td data-label="Paciente"><strong>{fullName(record.paciente)}</strong><div className="muted">{record.paciente?.telefono}</div></td>
              <td data-label="Motivo">{record.motivo_consulta}</td>
              <td data-label="Hallazgos">{[...record.enfermedades, ...record.problemas_piel].slice(0, 3).join(", ") || "Sin alertas registradas"}</td>
              <td data-label="Profesional">{fullName(record.profesional)}</td>
              <td data-label="Sede">{record.sede?.nombre}</td>
              <td data-label="Acciones"><div className="inline"><Button type="button" aria-label="Imprimir expediente" title="Imprimir expediente" onClick={() => printPodologyRecord(record)}><Printer /></Button><Button type="button" variant="danger" aria-label="Eliminar expediente" title="Eliminar expediente" disabled={deleteMutation.isPending} onClick={() => { if (confirm("¿Eliminar este expediente podologico? El registro se ocultara y la accion quedara en auditoria.")) deleteMutation.mutate(record.id); }}><Trash2 /></Button></div></td>
            </tr>)}</tbody></table></div>
        ) : <EmptyState title="Aun no hay evaluaciones podologicas" description="La primera evaluacion quedara enlazada al historial del paciente." />}
      </Card>
      {open ? <PodologyAppointmentModal defaultBranchId={selectedBranchId !== "all" ? selectedBranchId : branches[0]?.id ?? ""} onClose={() => setOpen(false)} /> : null}
    </main>
  );
}

function CheckboxGroup({ legend, options, registerName, register }: { legend: string; options: readonly (readonly [string, string])[]; registerName: "enfermedades" | "tratamientos" | "formas_unas" | "problemas_piel"; register: ReturnType<typeof useForm<PodologyRecordFormValues>>["register"] }) {
  return <fieldset className="clinical-options"><legend>{legend}</legend><div className="check-grid">{options.map(([value, label]) => <label className="check-option" key={value}><input type="checkbox" value={value} {...register(registerName)} /><span>{label}</span></label>)}</div></fieldset>;
}

export function PodologyModalLegacy({ branches, defaultBranchId, onClose }: { branches: Array<{ id: string; nombre: string }>; defaultBranchId: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const patientsQuery = useQuery({ queryKey: ["podology-patients"], queryFn: () => listPatients({ pageSize: 300 }) });
  const professionalsQuery = useQuery({ queryKey: ["podology-professionals"], queryFn: () => listProfessionals() });
  const form = useForm<PodologyRecordFormValues>({
    resolver: zodResolver(podologyRecordSchema),
    defaultValues: { paciente_id: "", cita_id: "", sede_id: defaultBranchId, profesional_id: null, fecha: todayISO(), motivo_consulta: "", pulso_pedio_izquierdo: false, pulso_pedio_derecho: false, pulso_tibial_izquierdo: false, pulso_tibial_derecho: false, temperatura: null, tipo_piel: null, enfermedades: [], otra_enfermedad: "", tratamientos: [], otro_tratamiento: "", formas_unas: [], alteraciones_unas: "", alergias: "", problemas_piel: [], otro_problema_piel: "", tipo_pie: null, mapa_anatomico_notas: "", observaciones: "" }
  });
  const { register, handleSubmit, formState: { errors } } = form;
  const mutation = useMutation({ mutationFn: createPodologyRecord, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["podology-records"] }); onClose(); }, onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo guardar el expediente") });

  return <Modal title="Nueva evaluacion podologica" onClose={onClose} footer={<><Button type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="podology-form" variant="primary" disabled={mutation.isPending}>{mutation.isPending ? "Guardando..." : "Guardar evaluacion"}</Button></>}>
    <form id="podology-form" className="stack" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
      {error ? <div className="alert">{error}</div> : null}
      <section className="form-section"><h3>Datos de la atencion</h3><div className="form-grid form-grid--three">
        <Field label="Paciente" error={errors.paciente_id?.message}><Select {...register("paciente_id")}><option value="">Seleccionar paciente</option>{(patientsQuery.data?.data ?? []).map((patient) => <option key={patient.id} value={patient.id}>{fullName(patient)} - {patient.telefono}</option>)}</Select></Field>
        <Field label="Sede" error={errors.sede_id?.message}><Select {...register("sede_id")}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}</option>)}</Select></Field>
        <Field label="Fecha" error={errors.fecha?.message}><Input type="date" {...register("fecha")} /></Field>
        <Field label="Profesional"><Select {...register("profesional_id")}><option value="">Sin asignar</option>{(professionalsQuery.data ?? []).map((professional) => <option key={professional.id} value={professional.id}>{fullName(professional)}</option>)}</Select></Field>
        <div className="field span-2"><label>Motivo de consulta</label><Textarea {...register("motivo_consulta")} />{errors.motivo_consulta ? <span className="field-error">{errors.motivo_consulta.message}</span> : null}</div>
      </div></section>

      <section className="form-section"><h3>Evaluacion vascular y piel</h3><div className="form-grid form-grid--three">
        <fieldset className="clinical-options"><legend>Pulsos</legend><div className="check-grid"><label className="check-option"><input type="checkbox" {...register("pulso_pedio_izquierdo")} />Pedio izquierdo</label><label className="check-option"><input type="checkbox" {...register("pulso_pedio_derecho")} />Pedio derecho</label><label className="check-option"><input type="checkbox" {...register("pulso_tibial_izquierdo")} />Tibial izquierdo</label><label className="check-option"><input type="checkbox" {...register("pulso_tibial_derecho")} />Tibial derecho</label></div></fieldset>
        <Field label="Temperatura"><Select {...register("temperatura")}><option value="">No evaluada</option><option value="fria">Fria</option><option value="normal">Normal</option><option value="caliente">Caliente</option></Select></Field>
        <Field label="Tipo de piel"><Select {...register("tipo_piel")}><option value="">No evaluado</option><option value="seca">Seca</option><option value="grasa">Grasa</option><option value="mixta">Mixta</option></Select></Field>
      </div></section>

      <section className="form-section"><h3>Antecedentes y procedimiento</h3><div className="form-grid">
        <CheckboxGroup legend="Enfermedades que padece" options={DISEASES} registerName="enfermedades" register={register} />
        <CheckboxGroup legend="Tratamiento realizado" options={TREATMENTS} registerName="tratamientos" register={register} />
        <Field label="Otra enfermedad"><Input {...register("otra_enfermedad")} /></Field><Field label="Otro tratamiento"><Input {...register("otro_tratamiento")} /></Field>
      </div></section>

      <section className="form-section"><h3>Evaluacion ungueal y dermatologica</h3><div className="form-grid">
        <CheckboxGroup legend="Forma de unas" options={NAIL_SHAPES} registerName="formas_unas" register={register} />
        <CheckboxGroup legend="Problemas en la piel" options={SKIN_PROBLEMS} registerName="problemas_piel" register={register} />
        <Field label="Alteraciones de unas"><Textarea {...register("alteraciones_unas")} /></Field><Field label="Alergias"><Textarea {...register("alergias")} /></Field>
        <Field label="Otro problema de piel"><Input {...register("otro_problema_piel")} /></Field><Field label="Tipo de pie"><Select {...register("tipo_pie")}><option value="">No evaluado</option><option value="romano">Romano</option><option value="egipcio">Egipcio</option><option value="griego">Griego</option><option value="cuadrado">Cuadrado</option></Select></Field>
        <Field label="Mapa anatomico - hallazgos"><Textarea {...register("mapa_anatomico_notas")} placeholder="Describe pie, lateralidad y ubicacion precisa" /></Field><Field label="Observaciones"><Textarea {...register("observaciones")} /></Field>
      </div></section>
    </form>
  </Modal>;
}

function PodologyAppointmentModal({ defaultBranchId, onClose }: { defaultBranchId: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const patientsQuery = useQuery({ queryKey: ["podology-patients-all"], queryFn: () => listPatients({ pageSize: 500 }) });
  const appointmentsQuery = useQuery({ queryKey: ["podology-appointments", defaultBranchId], queryFn: () => listPodologyAppointments(defaultBranchId) });
  const professionalsQuery = useQuery({ queryKey: ["podology-professionals"], queryFn: () => listProfessionals() });
  const form = useForm<PodologyRecordFormValues>({
    resolver: zodResolver(podologyRecordSchema),
    defaultValues: { paciente_id: "", cita_id: "", sede_id: defaultBranchId, profesional_id: null, fecha: todayISO(), motivo_consulta: "", pulso_pedio_izquierdo: null, pulso_pedio_derecho: null, pulso_tibial_izquierdo: null, pulso_tibial_derecho: null, temperatura: null, tipo_piel: null, enfermedades: [], otra_enfermedad: "", tratamientos: [], otro_tratamiento: "", formas_unas: [], alteraciones_unas: "", alergias: "", problemas_piel: [], otro_problema_piel: "", tipo_pie: null, mapa_anatomico_notas: "", observaciones: "" }
  });
  const { register, control, handleSubmit, setValue, formState: { errors } } = form;
  const patientId = useWatch({ control, name: "paciente_id" });
  const appointmentId = useWatch({ control, name: "cita_id" });
  const watchedDiseases = useWatch({ control, name: "enfermedades" });
  const watchedNailShapes = useWatch({ control, name: "formas_unas" });
  const nailChanges = useWatch({ control, name: "alteraciones_unas" }) ?? "";
  const watchedSkinProblems = useWatch({ control, name: "problemas_piel" });
  const pulses = useWatch({ control, name: ["pulso_pedio_izquierdo", "pulso_pedio_derecho", "pulso_tibial_izquierdo", "pulso_tibial_derecho"] });
  const appointment = (appointmentsQuery.data ?? []).find((item) => item.id === appointmentId);
  const availableAppointments = (appointmentsQuery.data ?? []).filter((item) => !patientId || item.paciente_id === patientId);
  const diseases = useMemo(() => watchedDiseases ?? [], [watchedDiseases]);
  const nailShapes = useMemo(() => watchedNailShapes ?? [], [watchedNailShapes]);
  const skinProblems = useMemo(() => watchedSkinProblems ?? [], [watchedSkinProblems]);

  useEffect(() => {
    if (!appointment) return;
    setValue("paciente_id", appointment.paciente_id);
    setValue("sede_id", appointment.sede_id);
    setValue("profesional_id", appointment.profesional_id ?? null);
    setValue("fecha", appointment.fecha);
    setValue("motivo_consulta", appointment.diagnostico?.trim() || appointment.tratamiento?.trim() || `Atencion de ${appointment.servicio?.nombre ?? "podologia"}`);
  }, [appointment, setValue]);

  const support = useMemo(() => {
    const treatments = ["asepsia"];
    if (nailShapes.length || nailChanges.trim()) treatments.push("limpieza_surcos", "onicotomia", "pulido");
    if (skinProblems.includes("ampollas")) treatments.push("fomentacion");
    treatments.push("asepsia_final");
    const alerts: string[] = [];
    if (diseases.includes("diabetes")) alerts.push("Paciente con diabetes: completar evaluacion de riesgo del pie y extremar controles.");
    if (pulses.some((pulse) => pulse === false)) alerts.push("Pulso ausente: valorar derivacion para evaluacion vascular.");
    if (skinProblems.some((item) => ["psoriasis", "tina", "vitiligo", "verrugas", "dermatitis"].includes(item))) alerts.push("Hallazgo dermatologico: confirmar valoracion o derivacion antes de indicar tratamiento.");
    return { treatments: Array.from(new Set(treatments)), alerts };
  }, [diseases, nailChanges, nailShapes, pulses, skinProblems]);

  const mutation = useMutation({ mutationFn: createPodologyRecord, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["podology-records"] }); queryClient.invalidateQueries({ queryKey: ["podology-appointments"] }); onClose(); }, onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo guardar el expediente") });

  return <Modal title="Nueva evaluacion podologica" onClose={onClose} footer={<><Button type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="podology-appointment-form" variant="primary" disabled={mutation.isPending}>{mutation.isPending ? "Guardando..." : "Guardar evaluacion"}</Button></>}>
    <form id="podology-appointment-form" className="stack" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
      {error ? <div className="alert">{error}</div> : null}
      <section className="form-section form-section--primary"><h3>Datos de la evaluacion</h3><div className="form-grid form-grid--three">
        <Field label="Paciente" error={errors.paciente_id?.message}><Select {...register("paciente_id")}><option value="">Seleccionar paciente</option>{(patientsQuery.data?.data ?? []).map((patient) => <option key={patient.id} value={patient.id}>{fullName(patient)} - {patient.dni ? `DNI ${patient.dni}` : patient.telefono}</option>)}</Select></Field>
        <Field label="Cita relacionada (opcional)"><Select {...register("cita_id")}><option value="">Sin cita relacionada</option>{availableAppointments.map((item) => <option key={item.id} value={item.id}>{toReadableDate(item.fecha)} - {item.servicio?.nombre}</option>)}</Select></Field>
        <Field label="Servicio relacionado"><Input value={appointment?.servicio?.nombre ?? "Sin cita relacionada"} readOnly /></Field>
        <input type="hidden" {...register("sede_id")} /><input type="hidden" {...register("fecha")} />
        <Field label="Profesional"><Select {...register("profesional_id")}><option value="">Sin asignar</option>{(professionalsQuery.data ?? []).map((professional) => <option key={professional.id} value={professional.id}>{fullName(professional)}</option>)}</Select></Field>
        <div className="field span-2"><label>Motivo de consulta</label><Textarea {...register("motivo_consulta")} />{errors.motivo_consulta ? <span className="field-error">{errors.motivo_consulta.message}</span> : null}</div>
      </div></section>

      <section className="form-section"><h3>Evaluacion neurovascular y piel</h3><div className="form-grid form-grid--three">
        <Field label="Pulso pedio izquierdo"><Select {...register("pulso_pedio_izquierdo")}><option value="">No evaluado</option><option value="true">Presente</option><option value="false">Ausente</option></Select></Field>
        <Field label="Pulso pedio derecho"><Select {...register("pulso_pedio_derecho")}><option value="">No evaluado</option><option value="true">Presente</option><option value="false">Ausente</option></Select></Field>
        <Field label="Pulso tibial izquierdo"><Select {...register("pulso_tibial_izquierdo")}><option value="">No evaluado</option><option value="true">Presente</option><option value="false">Ausente</option></Select></Field>
        <Field label="Pulso tibial derecho"><Select {...register("pulso_tibial_derecho")}><option value="">No evaluado</option><option value="true">Presente</option><option value="false">Ausente</option></Select></Field>
        <Field label="Temperatura"><Select {...register("temperatura")}><option value="">No evaluada</option><option value="fria">Fria</option><option value="normal">Normal</option><option value="caliente">Caliente</option></Select></Field>
        <Field label="Tipo de piel"><Select {...register("tipo_piel")}><option value="">No evaluado</option><option value="seca">Seca</option><option value="grasa">Grasa</option><option value="mixta">Mixta</option></Select></Field>
      </div></section>

      <section className="form-section"><h3>Antecedentes y hallazgos</h3><div className="form-grid">
        <CheckboxGroup legend="Enfermedades que padece" options={DISEASES} registerName="enfermedades" register={register} />
        <CheckboxGroup legend="Forma de unas" options={NAIL_SHAPES} registerName="formas_unas" register={register} />
        <CheckboxGroup legend="Problemas en la piel" options={SKIN_PROBLEMS} registerName="problemas_piel" register={register} />
        <Field label="Alteraciones de unas"><Textarea {...register("alteraciones_unas")} /></Field>
        <Field label="Alergias"><Textarea {...register("alergias")} /></Field><Field label="Tipo de pie"><Select {...register("tipo_pie")}><option value="">No evaluado</option><option value="romano">Romano</option><option value="egipcio">Egipcio</option><option value="griego">Griego</option><option value="cuadrado">Cuadrado</option></Select></Field>
      </div></section>

      <section className="clinical-assist"><div className="clinical-assist__heading"><div><Sparkles /><span><strong>Apoyo para el procedimiento</strong><small>Sugerencia basada en hallazgos; requiere confirmacion profesional.</small></span></div><Button type="button" onClick={() => setValue("tratamientos", support.treatments)}>Aplicar sugerencia</Button></div><div className="clinical-assist__treatments">{support.treatments.map((item) => <span key={item}>{TREATMENT_LABELS[item]}</span>)}</div>{support.alerts.map((alert) => <p className="clinical-assist__alert" key={alert}>{alert}</p>)}</section>

      <section className="form-section"><h3>Procedimiento confirmado</h3><div className="form-grid"><CheckboxGroup legend="Tratamiento realizado" options={TREATMENTS} registerName="tratamientos" register={register} /><Field label="Otro tratamiento o derivacion"><Textarea {...register("otro_tratamiento")} /></Field><Field label="Mapa anatomico - hallazgos"><Textarea {...register("mapa_anatomico_notas")} placeholder="Describe pie, lateralidad y ubicacion precisa" /></Field><Field label="Observaciones"><Textarea {...register("observaciones")} /></Field></div></section>
    </form>
  </Modal>;
}



