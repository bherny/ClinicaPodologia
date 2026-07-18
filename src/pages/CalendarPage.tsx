import { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useQuery } from "@tanstack/react-query";
import { APPOINTMENT_STATUSES } from "../constants";
import { Card } from "../components/ui/Card";
import { Field, Select } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { AppointmentStatusBadge } from "../components/ui/StatusBadge";
import { useBranch } from "../context/BranchContext";
import { fullName } from "../lib/format";
import { toReadableDate, toReadableTime } from "../lib/date";
import { listAppointments } from "../services/appointments";
import { listProfessionals, listServices } from "../services/catalog";
import type { CitaDetalle, EstadoCita } from "../types/domain";

export function CalendarPage() {
  const { selectedBranchId } = useBranch();
  const [professionalId, setProfessionalId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [status, setStatus] = useState<EstadoCita | "all">("all");
  const [selected, setSelected] = useState<CitaDetalle | null>(null);

  const appointmentsQuery = useQuery({
    queryKey: ["calendar-appointments", selectedBranchId, professionalId, serviceId, status],
    queryFn: () =>
      listAppointments({
        branchId: selectedBranchId,
        professionalId: professionalId || undefined,
        serviceId: serviceId || undefined,
        status,
        pageSize: 300
      })
  });

  const professionalsQuery = useQuery({ queryKey: ["calendar-professionals"], queryFn: () => listProfessionals() });
  const servicesQuery = useQuery({ queryKey: ["calendar-services"], queryFn: () => listServices() });
  const appointments = appointmentsQuery.data?.data ?? [];

  return (
    <main className="page">
      <PageHeader
        eyebrow="Calendario"
        title="Agenda diaria, semanal y mensual"
        description="Filtra por sede, profesional, servicio y estado. Selecciona una cita para revisar sus detalles."
      />
      <div className="toolbar">
        <div className="toolbar__filters">
          <Field label="Profesional">
            <Select value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}>
              <option value="">Todos</option>
              {(professionalsQuery.data ?? []).map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {fullName(professional)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Servicio">
            <Select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
              <option value="">Todos</option>
              {(servicesQuery.data ?? []).map((service) => (
                <option key={service.id} value={service.id}>
                  {service.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={status} onChange={(event) => setStatus(event.target.value as EstadoCita | "all")}>
              <option value="all">Todos</option>
              {APPOINTMENT_STATUSES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
      <Card className="calendar-card">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          locale="es"
          height="auto"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay"
          }}
          events={appointments.map((appointment) => ({
            id: appointment.id,
            title: `${toReadableTime(appointment.hora_inicio)} ${fullName(appointment.paciente)} · ${appointment.servicio?.nombre}`,
            start: `${appointment.fecha}T${appointment.hora_inicio}`,
            end: `${appointment.fecha}T${appointment.hora_fin}`,
            backgroundColor:
              appointment.estado === "cancelada"
                ? "#B42318"
                : appointment.estado === "confirmada"
                  ? "#17885B"
                  : appointment.estado === "reprogramada"
                    ? "#9B6DB2"
                    : "#5E92DB",
            extendedProps: { appointment }
          }))}
          eventClick={(info) => setSelected(info.event.extendedProps.appointment as CitaDetalle)}
        />
      </Card>

      {selected ? (
        <Modal title="Detalle de cita" onClose={() => setSelected(null)}>
          <div className="stack">
            <AppointmentStatusBadge status={selected.estado} />
            <dl className="form-grid">
              <div><dt className="muted">Paciente</dt><dd>{fullName(selected.paciente)}</dd></div>
              <div><dt className="muted">Telefono</dt><dd>{selected.paciente?.telefono}</dd></div>
              <div><dt className="muted">Fecha</dt><dd>{toReadableDate(selected.fecha)}</dd></div>
              <div><dt className="muted">Hora</dt><dd>{toReadableTime(selected.hora_inicio)} - {toReadableTime(selected.hora_fin)}</dd></div>
              <div><dt className="muted">Sede</dt><dd>{selected.sede?.nombre}</dd></div>
              <div><dt className="muted">Profesional</dt><dd>{fullName(selected.profesional)}</dd></div>
              <div className="span-2"><dt className="muted">Diagnostico</dt><dd>{selected.diagnostico ?? "Sin registrar"}</dd></div>
              <div className="span-2"><dt className="muted">Tratamiento</dt><dd>{selected.tratamiento ?? "Sin registrar"}</dd></div>
            </dl>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}
