import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageCircle, Send } from "lucide-react";
import { REMINDER_STATUSES } from "../constants";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { TableSkeleton } from "../components/ui/Skeleton";
import { AppointmentStatusBadge, ReminderStatusBadge } from "../components/ui/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useBranch } from "../context/BranchContext";
import { toReadableDate, toReadableTime } from "../lib/date";
import { fullName } from "../lib/format";
import { buildReminderMessage, buildWhatsAppUrl, hasValidWhatsAppPhone } from "../lib/whatsapp";
import { queryClient } from "../lib/queryClient";
import {
  filterReminderBucket,
  listReminderAppointments,
  saveReminderResult,
  type ReminderBucket
} from "../services/reminders";
import type { CitaDetalle, EstadoRecordatorio } from "../types/domain";

const reminderTabs: Array<{ id: ReminderBucket; label: string }> = [
  { id: "hoy", label: "Hoy" },
  { id: "manana", label: "Manana" },
  { id: "24h", label: "24 horas" },
  { id: "48h", label: "48 horas" },
  { id: "sin_recordatorio", label: "Sin recordatorio" },
  { id: "enviados", label: "Enviados" },
  { id: "pendiente_respuesta", label: "Pendiente respuesta" },
  { id: "confirmados", label: "Confirmados" },
  { id: "reprogramadas", label: "Reprogramadas" },
  { id: "canceladas", label: "Canceladas" }
];

export function RemindersPage() {
  const { selectedBranchId } = useBranch();
  const [hoursAhead, setHoursAhead] = useState(48);
  const [activeBucket, setActiveBucket] = useState<ReminderBucket>("sin_recordatorio");
  const [resultFor, setResultFor] = useState<CitaDetalle | null>(null);

  const remindersQuery = useQuery({
    queryKey: ["reminder-appointments", selectedBranchId, hoursAhead],
    queryFn: () => listReminderAppointments(selectedBranchId, hoursAhead)
  });

  const rows = useMemo(
    () => filterReminderBucket(remindersQuery.data ?? [], activeBucket),
    [activeBucket, remindersQuery.data]
  );

  const tomorrowWithoutReminder = filterReminderBucket(remindersQuery.data ?? [], "sin_recordatorio").filter(
    (appointment) => appointment.fecha === new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  );

  return (
    <main className="page">
      <PageHeader
        eyebrow="Recordatorios"
        title="Control de avisos por WhatsApp"
        description="La primera version abre WhatsApp con el mensaje preparado y registra manualmente el resultado."
      />

      {tomorrowWithoutReminder.length ? (
        <div className="alert" style={{ marginBottom: 16 }}>
          Hay {tomorrowWithoutReminder.length} pacientes con citas para manana que todavia no recibieron un recordatorio.
        </div>
      ) : null}

      <div className="toolbar">
        <div className="toolbar__filters">
          <Field label="Anticipacion">
            <Select value={hoursAhead} onChange={(event) => setHoursAhead(Number(event.target.value))}>
              <option value={24}>24 horas</option>
              <option value={48}>48 horas</option>
              <option value={72}>72 horas</option>
            </Select>
          </Field>
          <Field label="Horas personalizadas">
            <Input type="number" min={1} value={hoursAhead} onChange={(event) => setHoursAhead(Number(event.target.value))} />
          </Field>
        </div>
      </div>

      <Card>
        <div className="tabs" style={{ marginBottom: 16 }}>
          {reminderTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab ${activeBucket === tab.id ? "tab--active" : ""}`}
              onClick={() => setActiveBucket(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {remindersQuery.isLoading ? (
          <TableSkeleton />
        ) : rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cita</th>
                  <th>Paciente</th>
                  <th>Sede</th>
                  <th>Servicio</th>
                  <th>Estado cita</th>
                  <th>Recordatorio</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((appointment) => {
                  const latest = appointment.recordatorios?.[0];
                  const message = buildReminderMessage(appointment);
                  const canOpenWhatsApp = hasValidWhatsAppPhone(appointment.paciente?.telefono ?? "");
                  return (
                    <tr key={appointment.id}>
                      <td data-label="Cita">
                        <strong>{toReadableDate(appointment.fecha)}</strong>
                        <div className="muted">{toReadableTime(appointment.hora_inicio)}</div>
                      </td>
                      <td data-label="Paciente">
                        <strong>{fullName(appointment.paciente)}</strong>
                        <div className="muted">{appointment.paciente?.telefono}</div>
                      </td>
                      <td data-label="Sede">{appointment.sede?.nombre}</td>
                      <td data-label="Servicio">{appointment.servicio?.nombre}</td>
                      <td data-label="Estado cita">
                        <AppointmentStatusBadge status={appointment.estado} />
                      </td>
                      <td data-label="Recordatorio">{latest ? <ReminderStatusBadge status={latest.estado} /> : <span className="status status--programado">Sin enviar</span>}</td>
                      <td data-label="Acciones">
                        <div className="inline">
                          <Button
                            type="button"
                            variant="whatsapp"
                            disabled={!canOpenWhatsApp}
                            title={canOpenWhatsApp ? "Abrir WhatsApp" : "El paciente no tiene un celular peruano válido"}
                            onClick={() => {
                              window.open(buildWhatsAppUrl(appointment.paciente?.telefono ?? "", message), "_blank", "noopener,noreferrer");
                              setResultFor(appointment);
                            }}
                          >
                            <MessageCircle />
                            WhatsApp
                          </Button>
                          <Button type="button" onClick={() => setResultFor(appointment)}>
                            <Send />
                            Registrar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No hay citas en esta vista" />
        )}
      </Card>

      {resultFor ? <ReminderResultModal appointment={resultFor} onClose={() => setResultFor(null)} /> : null}
    </main>
  );
}

function ReminderResultModal({ appointment, onClose }: { appointment: CitaDetalle; onClose: () => void }) {
  const { profile } = useAuth();
  const [estado, setEstado] = useState<EstadoRecordatorio>("enviado");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const message = buildReminderMessage(appointment);
  const mutation = useMutation({
    mutationFn: () => saveReminderResult({ cita: appointment, estado, observaciones, enviadoPor: profile?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminder-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo guardar el recordatorio")
  });

  return (
    <Modal
      title="Registrar resultado del recordatorio"
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Guardar resultado
          </Button>
        </>
      }
    >
      <div className="stack">
        {error ? <div className="alert">{error}</div> : null}
        <div className="alert alert--info">{message}</div>
        <Field label="Resultado">
          <Select value={estado} onChange={(event) => setEstado(event.target.value as EstadoRecordatorio)}>
            {REMINDER_STATUSES.filter((item) => item.value !== "programado").map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Observaciones">
          <Textarea value={observaciones} onChange={(event) => setObservaciones(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
