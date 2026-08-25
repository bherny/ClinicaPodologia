import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, type UseFormRegister } from "react-hook-form";
import {
  Activity,
  BriefcaseBusiness,
  ClipboardCheck,
  ClipboardList,
  HeartPulse,
  House,
  Stethoscope,
  UserRound
} from "lucide-react";
import { useBranch } from "../../context/BranchContext";
import { useDraft } from "../../context/DraftContext";
import { todayISO, toReadableDate } from "../../lib/date";
import { fullName } from "../../lib/format";
import { queryClient } from "../../lib/queryClient";
import { listProfessionals } from "../../services/catalog";
import {
  clinicalHistorySchema,
  createClinicalHistory,
  normalizeClinicalEvaluation,
  updateClinicalHistory,
  type ClinicalHistoryFormValues
} from "../../services/history";
import { listPatients } from "../../services/patients";
import type { HistoriaClinicaDetalle, Paciente } from "../../types/domain";
import { Button } from "../ui/Button";
import { Field, Input, Select, Textarea } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { BodyPainMap } from "./BodyPainMap";

const FACTOR_OPTIONS = [
  ["flexionado", "Flexionado"],
  ["derecho", "Derecho"],
  ["sentado", "Sentado"],
  ["de_pie", "De pie"],
  ["sentarse", "Sentarse"],
  ["levantarse", "Levantarse"],
  ["quieto", "Quieto"],
  ["movimiento", "Movimiento"],
  ["am", "AM"],
  ["conforme_pasa_dia", "Conforme pasa el día"],
  ["pm", "PM"],
  ["caminando", "Caminando"],
  ["tumbado", "Tumbado"]
] as const;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function calculateAge(birthDate?: string | null, referenceDate?: string) {
  if (!birthDate) return "No registrada";
  const birth = new Date(`${birthDate}T12:00:00`);
  const reference = new Date(`${referenceDate || todayISO()}T12:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime())) return "No registrada";
  let age = reference.getFullYear() - birth.getFullYear();
  if (
    reference.getMonth() < birth.getMonth() ||
    (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate())
  ) age -= 1;
  return age >= 0 ? `${age} años` : "No registrada";
}

function patientSex(patient?: Pick<Paciente, "sexo"> | null) {
  if (patient?.sexo === "femenino") return "Femenino";
  if (patient?.sexo === "masculino") return "Masculino";
  if (patient?.sexo === "otro") return "Otro";
  return "No indicado";
}

function buildDefaultValues(history: HistoriaClinicaDetalle | null, defaultBranchId: string): ClinicalHistoryFormValues {
  return {
    paciente_id: history?.paciente_id ?? "",
    cita_id: history?.cita_id ?? null,
    sede_id: history?.sede_id ?? defaultBranchId,
    profesional_id: history?.profesional_id ?? null,
    fecha_evaluacion: history?.fecha_evaluacion ?? history?.cita?.fecha ?? todayISO(),
    diagnostico: history?.diagnostico ?? "",
    tratamiento_realizado: history?.tratamiento_realizado ?? "",
    evolucion: history?.evolucion ?? "",
    recomendaciones: history?.recomendaciones ?? "",
    proxima_fecha_sugerida: history?.proxima_fecha_sugerida ?? null,
    evaluacion: normalizeClinicalEvaluation(history?.evaluacion)
  };
}

export function ClinicalHistoryFormModal({
  history,
  onClose
}: {
  history: HistoriaClinicaDetalle | null;
  onClose: () => void;
}) {
  const { selectedBranchId, branches } = useBranch();
  const defaultBranchId = selectedBranchId !== "all" ? selectedBranchId : branches[0]?.id ?? "";
  const draftKey = `clinical-history:${history?.id ?? "new"}`;
  const { draft, recovered, saveDraft, clearDraft } = useDraft<ClinicalHistoryFormValues>(draftKey);
  const defaults = useMemo(
    () => draft ?? buildDefaultValues(history, defaultBranchId),
    [defaultBranchId, draft, history]
  );
  const [error, setError] = useState<string | null>(null);

  const patientsQuery = useQuery({
    queryKey: ["history-patients"],
    queryFn: () => listPatients({ pageSize: 300 }),
    enabled: !history
  });
  const professionalsQuery = useQuery({
    queryKey: ["history-professionals"],
    queryFn: () => listProfessionals()
  });
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm<ClinicalHistoryFormValues>({
    resolver: zodResolver(clinicalHistorySchema),
    defaultValues: defaults
  });

  const patientId = useWatch({ control, name: "paciente_id" });
  const evaluationDate = useWatch({ control, name: "fecha_evaluacion" });
  const painPoints = useWatch({ control, name: "evaluacion.localizacion_dolor_puntos" }) ?? [];
  const selectedPatient = history?.paciente ?? (patientsQuery.data?.data ?? []).find((patient) => patient.id === patientId) ?? null;

  useEffect(() => {
    let timer: number | undefined;
    const subscription = watch((value) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => saveDraft(value as ClinicalHistoryFormValues), 250);
    });
    return () => {
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [saveDraft, watch]);

  const mutation = useMutation({
    mutationFn: (values: ClinicalHistoryFormValues) =>
      history ? updateClinicalHistory(history.id, values) : createClinicalHistory(values),
    onSuccess: () => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["clinical-history"] });
      queryClient.invalidateQueries({ queryKey: ["patient-history"] });
      onClose();
    },
    onError: (nextError) => setError(getErrorMessage(nextError, "No se pudo guardar la historia clínica"))
  });

  return (
    <Modal
      size="wide"
      title={history ? "Editar historia clínica" : "Nueva historia clínica"}
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>Cerrar</Button>
          <Button form="complete-clinical-history-form" type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando..." : "Guardar historia clínica"}
          </Button>
        </>
      }
    >
      <form
        id="complete-clinical-history-form"
        className="clinical-history-form"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
      >
        {recovered ? <div className="draft-notice">Se recuperó el borrador que estabas completando.</div> : null}
        {error ? <div className="alert">{error}</div> : null}

        <header className="clinical-form-brand">
          <img src="/favicon.png" alt="Body Feet" />
          <div>
            <span>Body Feet · Centro de Podología y Rehabilitación</span>
            <h2>Historia clínica</h2>
            <p>Evaluación integral del paciente</p>
          </div>
        </header>

        <ClinicalFormSection icon={<UserRound />} title="Datos personales" number="01">
          <div className="clinical-form-grid clinical-form-grid--four">
            {history ? (
              <>
                <Field label="Paciente">
                  <Input value={fullName(history.paciente)} readOnly />
                </Field>
                <input type="hidden" {...register("paciente_id")} />
                <input type="hidden" {...register("cita_id")} />
                <Field label="Sede">
                  <Input value={history.sede?.nombre ?? ""} readOnly />
                </Field>
                <input type="hidden" {...register("sede_id")} />
              </>
            ) : (
              <>
                <Field label="Paciente" error={errors.paciente_id?.message}>
                  <Select {...register("paciente_id")}>
                    <option value="">Seleccionar paciente</option>
                    {(patientsQuery.data?.data ?? []).map((patient) => (
                      <option key={patient.id} value={patient.id}>{fullName(patient)} - {patient.telefono}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Sede" error={errors.sede_id?.message}>
                  <Select {...register("sede_id")}>
                    {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}</option>)}
                  </Select>
                </Field>
              </>
            )}
            <Field label="Fecha" error={errors.fecha_evaluacion?.message}>
              <Input type="date" {...register("fecha_evaluacion")} />
            </Field>
            <Field label="Sexo H/M">
              <Input value={patientSex(selectedPatient)} readOnly />
            </Field>
          </div>

          <div className="clinical-patient-summary">
            <PatientDatum label="Nombre" value={fullName(selectedPatient)} />
            <PatientDatum label="Dirección" value={selectedPatient?.direccion} />
            <PatientDatum label="Teléfono" value={selectedPatient?.telefono} />
            <PatientDatum label="Nacimiento" value={selectedPatient?.fecha_nacimiento ? toReadableDate(selectedPatient.fecha_nacimiento) : null} />
            <PatientDatum label="Edad" value={calculateAge(selectedPatient?.fecha_nacimiento, evaluationDate)} />
          </div>
          <Field label="¿Cómo nos has conocido?">
            <Input {...register("evaluacion.como_conocio")} />
          </Field>
          <div className="clinical-form-grid clinical-form-grid--two">
            <Field label="Profesional responsable">
              <Select {...register("profesional_id")}>
                <option value="">Sin asignar</option>
                {(professionalsQuery.data ?? []).map((professional) => (
                  <option key={professional.id} value={professional.id}>{fullName(professional)}</option>
                ))}
              </Select>
            </Field>
            <div aria-hidden="true" />
          </div>
        </ClinicalFormSection>

        <ClinicalFormSection icon={<BriefcaseBusiness />} title="Actividad laboral y física" number="02">
          <div className="clinical-form-grid clinical-form-grid--four">
            <Field label="Actividad laboral"><Input {...register("evaluacion.actividad_laboral")} /></Field>
            <Field label="Horas"><Input type="number" min="0" max="24" step="0.5" {...register("evaluacion.horas_laborales")} /></Field>
            <Field label="Tipo de actividad">
              <Select {...register("evaluacion.actividad_laboral_movimiento")}>
                <option value="">No indicado</option><option value="quieto">Quieto</option><option value="en_movimiento">En movimiento</option>
              </Select>
            </Field>
            <YesNoField label="Baja laboral" register={register} name="evaluacion.baja_laboral" />
          </div>
          <Field label="Deporte / Actividad física / Ocio">
            <Textarea {...register("evaluacion.deporte_actividad_fisica_ocio")} />
          </Field>
          <div className="clinical-form-grid clinical-form-grid--three">
            <Field label="Horas / Día"><Input type="number" min="0" max="24" step="0.5" {...register("evaluacion.horas_dia")} /></Field>
            <Field label="Días / Semana"><Input type="number" min="0" max="7" {...register("evaluacion.dias_semana")} /></Field>
            <Field label="Cargas / Autocargas"><Input {...register("evaluacion.cargas_autocargas")} /></Field>
          </div>
          <Field label="Especificaciones"><Textarea {...register("evaluacion.especificaciones_actividad")} /></Field>
        </ClinicalFormSection>

        <ClinicalFormSection icon={<ClipboardList />} title="Motivo de consulta" number="03">
          <Field label="Motivo de consulta">
            <Textarea rows={4} {...register("evaluacion.motivo_consulta")} />
          </Field>
        </ClinicalFormSection>

        <ClinicalFormSection icon={<HeartPulse />} title="Síntomas presentes" number="04">
          <Field label="Síntomas presentes"><Textarea rows={4} {...register("evaluacion.sintomas_presentes")} /></Field>
          <div className="clinical-form-grid clinical-form-grid--two">
            <Field label="Presentes desde"><Input {...register("evaluacion.presentes_desde")} /></Field>
            <Field label="Tras realizar"><Input {...register("evaluacion.tras_realizar")} /></Field>
            <Field label="Comenzaron por"><Input {...register("evaluacion.comenzaron_por")} /></Field>
            <label className="clinical-check clinical-check--standalone">
              <input type="checkbox" {...register("evaluacion.sin_motivo")} />
              <span>Comenzaron sin motivo aparente</span>
            </label>
            <Field label="¿Dónde comenzaron?"><Input {...register("evaluacion.donde_comenzaron")} /></Field>
            <Field label="Evolución de los síntomas">
              <Select {...register("evaluacion.evolucion_sintomas")}>
                <option value="">No indicada</option><option value="mejorando">Mejorando</option><option value="empeorando">Empeorando</option><option value="sin_cambios">Sin cambios</option>
              </Select>
            </Field>
            <Field label="Tiempo en aparecer los síntomas"><Input {...register("evaluacion.tiempo_aparecer_sintomas")} /></Field>
            <Field label="Episodio anterior"><Input {...register("evaluacion.episodio_anterior")} /></Field>
            <Field label="Tratamiento anterior / actual"><Textarea {...register("evaluacion.tratamiento_anterior_actual")} /></Field>
            <Field label="Síntomas constantes en"><Textarea {...register("evaluacion.sintomas_constantes")} /></Field>
            <Field label="Síntomas intermitentes en"><Textarea {...register("evaluacion.sintomas_intermitentes")} /></Field>
            <Field label="EVA (0 a 10)" error={errors.evaluacion?.eva?.message}>
              <Input type="number" min="0" max="10" step="1" {...register("evaluacion.eva")} />
            </Field>
            <YesNoField label="¿El dolor te ha impedido trabajar alguna vez?" register={register} name="evaluacion.dolor_impidio_trabajar" />
          </div>
        </ClinicalFormSection>

        <ClinicalFormSection icon={<Activity />} title="Localización del dolor" number="05">
          <div className="clinical-pain-layout">
            <div>
              <label className="clinical-inline-label">Marque en el esquema la zona donde percibe los síntomas</label>
              <BodyPainMap
                points={painPoints}
                onChange={(points) => setValue("evaluacion.localizacion_dolor_puntos", points, { shouldDirty: true, shouldValidate: true })}
              />
            </div>
            <Field label="Descripción de la localización">
              <Textarea rows={9} {...register("evaluacion.localizacion_dolor_notas")} />
            </Field>
          </div>
        </ClinicalFormSection>

        <ClinicalFormSection icon={<Stethoscope />} title="Limitaciones" number="06">
          <Field label="Limitaciones"><Textarea rows={4} {...register("evaluacion.limitaciones")} /></Field>
          <div className="clinical-form-grid clinical-form-grid--four">
            <YesNoField label="Dolor nocturno" register={register} name="evaluacion.dolor_nocturno" />
            <YesNoField label="Dolor al toser, estornudar o hacer fuerza" register={register} name="evaluacion.dolor_tos_estornudo_esfuerzo" />
            <Field label="Marcha">
              <Select {...register("evaluacion.marcha")}><option value="">No indicada</option><option value="normal">Normal</option><option value="diferente">Diferente</option></Select>
            </Field>
            <YesNoField label="Continencia vesical / intestinal" register={register} name="evaluacion.continencia_vesical_intestinal" />
          </div>
          <div className="clinical-form-grid clinical-form-grid--two">
            <Field label="Salud general / Comorbilidades"><Textarea {...register("evaluacion.salud_general_comorbilidades")} /></Field>
            <Field label="Medicación"><Textarea {...register("evaluacion.medicacion")} /></Field>
            <Field label="Cirugía"><Input {...register("evaluacion.cirugia")} /></Field>
            <Field label="Pruebas de imagen"><Input {...register("evaluacion.pruebas_imagen")} /></Field>
            <Field label="Cambio de peso"><Input {...register("evaluacion.cambio_peso")} /></Field>
            <Field label="Historial cáncer"><Input {...register("evaluacion.historial_cancer")} /></Field>
            <Field label="Historia trauma"><Textarea {...register("evaluacion.historia_trauma")} /></Field>
          </div>
        </ClinicalFormSection>

        <ClinicalFormSection icon={<Activity />} title="Peor" number="07">
          <FactorChecklist register={register} name="evaluacion.peor" />
          <Field label="Otro"><Input {...register("evaluacion.peor_otro")} /></Field>
        </ClinicalFormSection>

        <ClinicalFormSection icon={<Activity />} title="Mejor" number="08">
          <FactorChecklist register={register} name="evaluacion.mejor" />
          <Field label="Otro"><Input {...register("evaluacion.mejor_otro")} /></Field>
        </ClinicalFormSection>

        <ClinicalFormSection icon={<ClipboardCheck />} title="Preguntas clave" number="09">
          <Field label="¿A qué le echas la culpa de lo que te está pasando?"><Textarea {...register("evaluacion.culpa_percibida")} /></Field>
          <Field label="¿Qué esperas conseguir de esta visita?"><Textarea {...register("evaluacion.expectativa_visita")} /></Field>
          <Field label="¿Hay algo importante en el tintero?"><Textarea {...register("evaluacion.informacion_importante")} /></Field>
        </ClinicalFormSection>

        <ClinicalFormSection icon={<ClipboardList />} title="Test" number="10">
          {[0, 1, 2].map((index) => (
            <Field key={index} label={`${index + 1}.`}><Input {...register(`evaluacion.tests.${index}` as const)} /></Field>
          ))}
        </ClinicalFormSection>

        <ClinicalFormSection icon={<Stethoscope />} title="Reevaluación" number="11">
          <Field label="Reevaluación"><Textarea rows={4} {...register("evaluacion.reevaluacion")} /></Field>
        </ClinicalFormSection>

        <ClinicalFormSection icon={<ClipboardList />} title="Anotaciones" number="12">
          <Field label="Anotaciones"><Textarea rows={5} {...register("evaluacion.anotaciones")} /></Field>
        </ClinicalFormSection>

        <ClinicalFormSection icon={<HeartPulse />} title="Hipótesis de diagnóstico" number="13">
          {[0, 1, 2].map((index) => (
            <Field key={index} label={`${index + 1}.`}><Input {...register(`evaluacion.hipotesis_diagnostico.${index}` as const)} /></Field>
          ))}
        </ClinicalFormSection>

        <ClinicalFormSection icon={<House />} title="Trabajo para casa" number="14">
          <Field label="De todo lo que le he explicado al paciente, ¿con qué se ha quedado?">
            <Textarea rows={5} {...register("evaluacion.trabajo_casa")} />
          </Field>
          <Field label="Próxima sesión">
            <Input type="date" {...register("proxima_fecha_sugerida")} />
          </Field>
        </ClinicalFormSection>

        <input type="hidden" {...register("diagnostico")} />
        <input type="hidden" {...register("tratamiento_realizado")} />
        <input type="hidden" {...register("evolucion")} />
        <input type="hidden" {...register("recomendaciones")} />
      </form>
    </Modal>
  );
}

function ClinicalFormSection({
  icon,
  title,
  number,
  children
}: {
  icon: React.ReactNode;
  title: string;
  number: string;
  children: React.ReactNode;
}) {
  return (
    <section className="clinical-form-section">
      <header>
        <span className="clinical-form-section__number">{number}</span>
        <span className="clinical-form-section__icon">{icon}</span>
        <h3>{title}</h3>
      </header>
      <div className="clinical-form-section__body">{children}</div>
    </section>
  );
}

function PatientDatum({ label, value }: { label: string; value?: string | null }) {
  return <div><span>{label}</span><strong>{value || "No registrado"}</strong></div>;
}

function YesNoField({
  label,
  register,
  name
}: {
  label: string;
  register: UseFormRegister<ClinicalHistoryFormValues>;
  name:
    | "evaluacion.baja_laboral"
    | "evaluacion.dolor_impidio_trabajar"
    | "evaluacion.dolor_nocturno"
    | "evaluacion.dolor_tos_estornudo_esfuerzo"
    | "evaluacion.continencia_vesical_intestinal";
}) {
  return (
    <Field label={label}>
      <Select {...register(name)}>
        <option value="">No indicado</option>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </Select>
    </Field>
  );
}

function FactorChecklist({
  register,
  name
}: {
  register: UseFormRegister<ClinicalHistoryFormValues>;
  name: "evaluacion.peor" | "evaluacion.mejor";
}) {
  return (
    <fieldset className="clinical-factor-grid">
      <legend>Factores relacionados</legend>
      {FACTOR_OPTIONS.map(([value, label]) => (
        <label className="clinical-check" key={value}>
          <input type="checkbox" value={value} {...register(name)} />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}