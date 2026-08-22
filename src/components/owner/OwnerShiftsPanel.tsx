import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Edit, Plus, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Field, Input, Select } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { queryClient } from "../../lib/queryClient";
import { fullName } from "../../lib/format";
import { formatMinutesDuration, fromTime12Parts, minutesBetweenTimes, toReadableTime12, toTime12Parts, type TimePeriod } from "../../lib/date";
import { cancelShift, upsertShift } from "../../services/attendance";
import type { Profesional, Sede, TurnoProfesionalDetalle } from "../../types/domain";

const DAYS = [
  { value: 1, short: "Lun", label: "Lunes" },
  { value: 2, short: "Mar", label: "Martes" },
  { value: 3, short: "Mie", label: "Miercoles" },
  { value: 4, short: "Jue", label: "Jueves" },
  { value: 5, short: "Vie", label: "Viernes" },
  { value: 6, short: "Sab", label: "Sabado" },
  { value: 7, short: "Dom", label: "Domingo" }
];

type Props = {
  professionals: Profesional[];
  branches: Sede[];
  shifts: TurnoProfesionalDetalle[];
};

type ShiftDraft = Partial<TurnoProfesionalDetalle> & { selectedDays: number[] };

function activeOnToday(shift: TurnoProfesionalDetalle) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  return shift.activo && shift.vigente_desde <= today && (!shift.vigente_hasta || shift.vigente_hasta >= today);
}

export function OwnerShiftsPanel({ professionals, branches, shifts }: Props) {
  const [draft, setDraft] = useState<ShiftDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentShifts = useMemo(() => shifts.filter(activeOnToday), [shifts]);
  const cancelMutation = useMutation({
    mutationFn: cancelShift,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["owner-shifts"] }),
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo cancelar el turno.")
  });

  return (
    <section className="owner-section stack">
      <div className="owner-section__heading">
        <div>
          <h2>Turnos del personal</h2>
          <p>Los horarios utilizan los mismos profesionales registrados en Administracion.</p>
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={() => setDraft({
            selectedDays: [1],
            profesional_id: professionals[0]?.id ?? "",
            sede_id: branches[0]?.id ?? "",
            hora_inicio: "08:00",
            hora_fin: "18:00",
            tolerancia_minutos: 10,
            vigente_desde: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date()),
            vigente_hasta: null,
            es_descanso: false,
            activo: true
          })}
        >
          <Plus /> Nuevo turno
        </Button>
      </div>
      {error ? <div className="alert">{error}</div> : null}

      <div className="owner-weekly-wrap">
        <table className="owner-weekly" aria-label="Horario semanal vigente">
          <thead><tr><th>Profesional</th>{DAYS.map((day) => <th key={day.value}>{day.short}</th>)}</tr></thead>
          <tbody>
            {professionals.map((professional) => (
              <tr key={professional.id}>
                <th>{fullName(professional)}<small className="owner-professional-weekly-hours">{formatMinutesDuration(currentShifts.filter((shift) => shift.profesional_id === professional.id && !shift.es_descanso).reduce((total, shift) => total + minutesBetweenTimes(shift.hora_inicio, shift.hora_fin), 0))} semanales</small></th>
                {DAYS.map((day) => {
                  const items = currentShifts.filter((shift) => shift.profesional_id === professional.id && shift.dia_semana === day.value);
                  return (
                    <td key={day.value}>
                      {items.length ? items.map((shift) => (
                        <button
                          type="button"
                          className={`owner-shift-chip ${shift.es_descanso ? "owner-shift-chip--rest" : ""}`}
                          key={shift.id}
                          onClick={() => setDraft({ ...shift, selectedDays: [shift.dia_semana] })}
                        >
                          {shift.es_descanso ? "Descanso" : `${toReadableTime12(shift.hora_inicio)} - ${toReadableTime12(shift.hora_fin)}`}
                          <small>{shift.sede?.nombre} · {formatMinutesDuration(minutesBetweenTimes(shift.hora_inicio, shift.hora_fin))}</small>
                        </button>
                      )) : <span className="muted">Sin turno</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shifts.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Profesional</th><th>Dia</th><th>Horario</th><th>Horas</th><th>Sede</th><th>Vigencia</th><th>Tolerancia</th><th>Acciones</th></tr></thead>
            <tbody>{shifts.map((shift) => (
              <tr key={shift.id}>
                <td data-label="Profesional"><strong>{fullName(shift.profesional)}</strong></td>
                <td data-label="Dia">{DAYS.find((day) => day.value === shift.dia_semana)?.label}</td>
                <td data-label="Horario">{shift.es_descanso ? "Descanso" : `${toReadableTime12(shift.hora_inicio)} - ${toReadableTime12(shift.hora_fin)}`}</td>
                <td data-label="Horas">{shift.es_descanso ? "0 h" : formatMinutesDuration(minutesBetweenTimes(shift.hora_inicio, shift.hora_fin))}</td>
                <td data-label="Sede">{shift.sede?.nombre}</td>
                <td data-label="Vigencia">{shift.vigente_desde} a {shift.vigente_hasta || "indefinido"}</td>
                <td data-label="Tolerancia">{shift.tolerancia_minutos} min</td>
                <td data-label="Acciones"><div className="inline">
                  <Button type="button" aria-label="Editar turno" onClick={() => setDraft({ ...shift, selectedDays: [shift.dia_semana] })}><Edit /></Button>
                  <Button type="button" aria-label="Copiar turno" onClick={() => setDraft({ ...shift, id: undefined, selectedDays: [shift.dia_semana] })}><Copy /></Button>
                  <Button type="button" variant="danger" aria-label="Cancelar turno" disabled={cancelMutation.isPending} onClick={() => { if (confirm("Cancelar este turno futuro? El historial de asistencia se conservara.")) cancelMutation.mutate(shift.id); }}><Trash2 /></Button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <EmptyState title="Aun no hay turnos" description="Crea el primer horario semanal para comenzar a comparar las marcaciones." />}

      {draft ? <ShiftModal draft={draft} professionals={professionals} branches={branches} onClose={() => setDraft(null)} /> : null}
    </section>
  );
}

function Time12Field({
  label,
  value,
  fallback,
  disabled,
  onChange
}: {
  label: string;
  value?: string | null;
  fallback: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const parts = toTime12Parts(value) ?? toTime12Parts(fallback)!;
  const hours = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
  const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
  const update = (next: Partial<{ hour: string; minute: string; period: TimePeriod }>) => {
    onChange(fromTime12Parts(next.hour ?? parts.hour, next.minute ?? parts.minute, next.period ?? parts.period));
  };

  return <Field label={label}>
    <div className="owner-time-control">
      <Select aria-label={`${label}: hora`} disabled={disabled} value={parts.hour} onChange={(event) => update({ hour: event.target.value })}>
        {hours.map((hour) => <option value={hour} key={hour}>{hour}</option>)}
      </Select>
      <span aria-hidden="true">:</span>
      <Select aria-label={`${label}: minutos`} disabled={disabled} value={parts.minute} onChange={(event) => update({ minute: event.target.value })}>
        {minutes.map((minute) => <option value={minute} key={minute}>{minute}</option>)}
      </Select>
      <Select aria-label={`${label}: AM o PM`} disabled={disabled} value={parts.period} onChange={(event) => update({ period: event.target.value as TimePeriod })}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </Select>
    </div>
  </Field>;
}

function ShiftModal({ draft, professionals, branches, onClose }: { draft: ShiftDraft; professionals: Profesional[]; branches: Sede[]; onClose: () => void }) {
  const [values, setValues] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!values.profesional_id || !values.sede_id || !values.selectedDays.length || !values.vigente_desde) {
        throw new Error("Completa profesional, sede, dias y fecha de inicio.");
      }
      if (!values.es_descanso && (!values.hora_inicio || !values.hora_fin || values.hora_fin <= values.hora_inicio)) {
        throw new Error("La hora de salida debe ser posterior a la entrada.");
      }
      for (const [index, day] of values.selectedDays.entries()) {
        await upsertShift({
          ...values,
          id: index === 0 ? values.id : undefined,
          dia_semana: day
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-shifts"] });
      onClose();
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo guardar el turno.")
  });

  const dailyMinutes = values.es_descanso ? 0 : minutesBetweenTimes(values.hora_inicio, values.hora_fin);
  const selectedWeeklyMinutes = dailyMinutes * values.selectedDays.length;

  const toggleDay = (day: number) => setValues((current) => ({
    ...current,
    selectedDays: current.selectedDays.includes(day)
      ? current.selectedDays.filter((item) => item !== day)
      : [...current.selectedDays, day].sort()
  }));

  return (
    <Modal title={values.id ? "Editar turno" : "Nuevo turno"} onClose={onClose} footer={<><Button type="button" onClick={onClose}>Cancelar</Button><Button type="button" variant="primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Guardando..." : "Guardar turno"}</Button></>}>
      <div className="stack">
        {error ? <div className="alert">{error}</div> : null}
        <div className="form-grid">
          <Field label="Profesional"><Select value={values.profesional_id ?? ""} onChange={(event) => setValues({ ...values, profesional_id: event.target.value })}>{professionals.map((professional) => <option value={professional.id} key={professional.id}>{fullName(professional)}</option>)}</Select></Field>
          <Field label="Sede"><Select value={values.sede_id ?? ""} onChange={(event) => setValues({ ...values, sede_id: event.target.value })}>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.nombre}</option>)}</Select></Field>
          <Field label="Vigente desde"><Input type="date" value={values.vigente_desde ?? ""} onChange={(event) => setValues({ ...values, vigente_desde: event.target.value })} /></Field>
          <Field label="Vigente hasta"><Input type="date" value={values.vigente_hasta ?? ""} onChange={(event) => setValues({ ...values, vigente_hasta: event.target.value || null })} /></Field>
          <Time12Field label="Hora de entrada" value={values.hora_inicio} fallback="08:00" disabled={values.es_descanso} onChange={(hora_inicio) => setValues({ ...values, hora_inicio })} />
          <Time12Field label="Hora de salida" value={values.hora_fin} fallback="18:00" disabled={values.es_descanso} onChange={(hora_fin) => setValues({ ...values, hora_fin })} />
          <Field label="Tolerancia (minutos)"><Input type="number" min="0" max="180" value={values.tolerancia_minutos ?? 10} onChange={(event) => setValues({ ...values, tolerancia_minutos: Number(event.target.value) })} /></Field>
          <label className="owner-rest-toggle"><input type="checkbox" checked={values.es_descanso ?? false} onChange={(event) => setValues({ ...values, es_descanso: event.target.checked })} /><span>Este dia es descanso</span></label>
        </div>
        <section className="owner-shift-duration-preview" aria-live="polite">
          <div><span>Jornada diaria</span><strong>{values.es_descanso ? "Descanso" : formatMinutesDuration(dailyMinutes)}</strong></div>
          <div><span>Total para los dias seleccionados</span><strong>{values.es_descanso ? "0 h" : formatMinutesDuration(selectedWeeklyMinutes)}</strong></div>
        </section>
        <fieldset className="owner-day-selector">
          <legend>Dias de la semana</legend>
          <div>{DAYS.map((day) => <label key={day.value}><input type="checkbox" checked={values.selectedDays.includes(day.value)} onChange={() => toggleDay(day.value)} /><span>{day.label}</span></label>)}</div>
        </fieldset>
      </div>
    </Modal>
  );
}
