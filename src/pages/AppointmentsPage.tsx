import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus, Download, Edit, Printer, Stethoscope, Trash2 } from "lucide-react";
import { APPOINTMENT_STATUSES } from "../constants";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { TableSkeleton } from "../components/ui/Skeleton";
import { AppointmentStatusBadge } from "../components/ui/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useBranch } from "../context/BranchContext";
import { downloadCsv } from "../lib/csv";
import { addMinutesToTime, toReadableDate, toReadableTime } from "../lib/date";
import { fullName } from "../lib/format";
import { printAppointmentCard } from "../lib/print";
import { queryClient } from "../lib/queryClient";
import {
  appointmentSchema,
  createAppointment,
  listAppointments,
  softDeleteAppointment,
  updateAppointment,
  updateAppointmentStatus,
  type AppointmentFormValues
} from "../services/appointments";
import { createPatient, listPatients, type PatientFormValues } from "../services/patients";
import { listProfessionals, listServices } from "../services/catalog";
import {
  clinicalHistorySchema,
  createClinicalHistory,
  type ClinicalHistoryFormValues
} from "../services/history";
import type { CitaDetalle, EstadoCita } from "../types/domain";

export function AppointmentsPage() {
  const { selectedBranchId, branches } = useBranch();
  const location = useLocation();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState<EstadoCita | "all">("all");
  const [editing, setEditing] = useState<CitaDetalle | null | "new">(null);
  const [attending, setAttending] = useState<CitaDetalle | null>(null);

  useEffect(() => {
    const routeState = location.state as { openNewAppointment?: boolean } | null;
    if (!routeState?.openNewAppointment) return;
    setEditing("new");
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", selectedBranchId, dateFrom, dateTo, status],
    queryFn: () =>
      listAppointments({
        branchId: selectedBranchId,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        status,
        pageSize: 80
      })
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoCita }) => updateAppointmentStatus(id, estado),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["appointments"] })
  });

  const deleteMutation = useMutation({
    mutationFn: softDeleteAppointment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["appointments"] })
  });

  const rows = appointmentsQuery.data?.data ?? [];

  return (
    <main className="page">
      <PageHeader
        eyebrow="Citas"
        title="Agenda de atenciones"
        description="Registra, reprograma, cancela y confirma citas asociadas a pacientes, servicios, profesionales y sedes."
        action={
          <Button type="button" variant="primary" onClick={() => setEditing("new")}>
            <CalendarPlus />
            Nueva cita
          </Button>
        }
      />

      <div className="toolbar">
        <div className="toolbar__filters">
          <Field label="Desde">
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
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
        <Button
          type="button"
          onClick={() =>
            downloadCsv(
              "citas-body-feet.csv",
              rows.map((appointment) => ({
                fecha: appointment.fecha,
                hora: appointment.hora_inicio,
                paciente: fullName(appointment.paciente),
                telefono: appointment.paciente?.telefono,
                sede: appointment.sede?.nombre,
                servicio: appointment.servicio?.nombre,
                profesional: fullName(appointment.profesional),
                estado: appointment.estado
              }))
            )
          }
        >
          <Download />
          Exportar CSV
        </Button>
      </div>

      <Card>
        {appointmentsQuery.isLoading ? (
          <TableSkeleton />
        ) : rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Paciente</th>
                  <th>Sede</th>
                  <th>Servicio</th>
                  <th>Profesional</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((appointment) => (
                  <tr key={appointment.id}>
                    <td data-label="Fecha">
                      <strong>{toReadableDate(appointment.fecha)}</strong>
                      <div className="muted">
                        {toReadableTime(appointment.hora_inicio)} - {toReadableTime(appointment.hora_fin)}
                      </div>
                    </td>
                    <td data-label="Paciente">
                      <strong>{fullName(appointment.paciente)}</strong>
                      <div className="muted">{appointment.paciente?.telefono}</div>
                    </td>
                    <td data-label="Sede">{appointment.sede?.nombre}</td>
                    <td data-label="Servicio">{appointment.servicio?.nombre}</td>
                    <td data-label="Profesional">{fullName(appointment.profesional)}</td>
                    <td data-label="Estado">
                      <AppointmentStatusBadge status={appointment.estado} />
                    </td>
                    <td data-label="Acciones">
                      <div className="inline">
                        <Select
                          value={appointment.estado}
                          onChange={(event) =>
                            statusMutation.mutate({ id: appointment.id, estado: event.target.value as EstadoCita })
                          }
                          aria-label="Cambiar estado"
                        >
                          {APPOINTMENT_STATUSES.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </Select>
                        <Button type="button" onClick={() => setEditing(appointment)} aria-label="Editar cita">
                          <Edit />
                        </Button>
                        <Button type="button" onClick={() => setAttending(appointment)} aria-label="Registrar atencion clinica">
                          <Stethoscope />
                        </Button>
                        <Button type="button" onClick={() => printAppointmentCard(appointment)} aria-label="Imprimir cita">
                          <Printer />
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => {
                            if (confirm("¿Eliminar logicamente esta cita?")) deleteMutation.mutate(appointment.id);
                          }}
                          aria-label="Eliminar cita"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No hay citas en el rango seleccionado" />
        )}
      </Card>

      {editing ? (
        <AppointmentModal
          appointment={editing === "new" ? null : editing}
          branches={branches}
          defaultBranchId={selectedBranchId !== "all" ? selectedBranchId : branches[0]?.id}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {attending ? <ClinicalAttentionModal appointment={attending} onClose={() => setAttending(null)} /> : null}
    </main>
  );
}

function ClinicalAttentionModal({ appointment, onClose }: { appointment: CitaDetalle; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const professionalsQuery = useQuery({ queryKey: ["attention-professionals"], queryFn: () => listProfessionals() });
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<ClinicalHistoryFormValues>({
    resolver: zodResolver(clinicalHistorySchema),
    defaultValues: {
      paciente_id: appointment.paciente_id,
      cita_id: appointment.id,
      sede_id: appointment.sede_id,
      profesional_id: appointment.profesional_id ?? null,
      diagnostico: appointment.diagnostico ?? "",
      tratamiento_realizado: appointment.tratamiento ?? "",
      evolucion: "",
      recomendaciones: "",
      proxima_fecha_sugerida: ""
    }
  });

  const mutation = useMutation({
    mutationFn: async (values: ClinicalHistoryFormValues) => {
      await createClinicalHistory({
        ...values,
        profesional_id: values.profesional_id || null,
        proxima_fecha_sugerida: values.proxima_fecha_sugerida || null
      });
      await updateAppointmentStatus(appointment.id, "atendida");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["clinical-history"] });
      queryClient.invalidateQueries({ queryKey: ["patient-history"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (nextError) => {
      setError(nextError instanceof Error ? nextError.message : "No se pudo registrar la atencion");
    }
  });

  return (
    <Modal
      title="Registrar atencion clinica"
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="clinical-attention-form" type="submit" variant="primary" disabled={mutation.isPending}>
            Guardar atencion
          </Button>
        </>
      }
    >
      <form
        id="clinical-attention-form"
        className="form-grid"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
      >
        {error ? <div className="alert span-2">{error}</div> : null}
        <div className="alert alert--info span-2">
          Esta atencion quedara vinculada a {fullName(appointment.paciente)}, la cita del {toReadableDate(appointment.fecha)} y la sede {appointment.sede?.nombre}.
        </div>
        <input type="hidden" {...register("paciente_id")} />
        <input type="hidden" {...register("cita_id")} />
        <input type="hidden" {...register("sede_id")} />
        <Field label="Profesional">
          <Select {...register("profesional_id")}>
            <option value="">Sin asignar</option>
            {(professionalsQuery.data ?? []).map((professional) => (
              <option key={professional.id} value={professional.id}>
                {fullName(professional)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Proxima fecha sugerida">
          <Input type="date" {...register("proxima_fecha_sugerida")} />
        </Field>
        <div className="field span-2">
          <label>Diagnostico</label>
          <Textarea {...register("diagnostico")} />
          {errors.diagnostico ? <span className="field-error">{errors.diagnostico.message}</span> : null}
        </div>
        <div className="field span-2">
          <label>Tratamiento realizado</label>
          <Textarea {...register("tratamiento_realizado")} />
          {errors.tratamiento_realizado ? <span className="field-error">{errors.tratamiento_realizado.message}</span> : null}
        </div>
        <div className="field span-2">
          <label>Evolucion</label>
          <Textarea {...register("evolucion")} />
        </div>
        <div className="field span-2">
          <label>Recomendaciones</label>
          <Textarea {...register("recomendaciones")} />
        </div>
      </form>
    </Modal>
  );
}

function AppointmentModal({
  appointment,
  branches,
  defaultBranchId,
  onClose
}: {
  appointment: CitaDetalle | null;
  branches: { id: string; nombre: string }[];
  defaultBranchId?: string;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [patientMode, setPatientMode] = useState<"existing" | "quick">("existing");
  const [quickPatient, setQuickPatient] = useState({
    nombres: "",
    apellidos: "",
    telefono: "",
    dni: ""
  });
  const patientsQuery = useQuery({ queryKey: ["patient-options"], queryFn: () => listPatients({ pageSize: 250 }) });
  const servicesQuery = useQuery({ queryKey: ["service-options"], queryFn: () => listServices() });
  const professionalsQuery = useQuery({ queryKey: ["professional-options"], queryFn: () => listProfessionals() });

  const serviceMap = useMemo(
    () => new Map((servicesQuery.data ?? []).map((service) => [service.id, service])),
    [servicesQuery.data]
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      paciente_id: appointment?.paciente_id ?? "",
      sede_id: appointment?.sede_id ?? defaultBranchId ?? "",
      servicio_id: appointment?.servicio_id ?? "",
      profesional_id: appointment?.profesional_id ?? null,
      fecha: appointment?.fecha ?? "",
      hora_inicio: appointment?.hora_inicio?.slice(0, 5) ?? "",
      hora_fin: appointment?.hora_fin?.slice(0, 5) ?? "",
      diagnostico: appointment?.diagnostico ?? "",
      tratamiento: appointment?.tratamiento ?? "",
      observaciones: appointment?.observaciones ?? "",
      estado: appointment?.estado ?? "pendiente",
      creado_por: appointment?.creado_por ?? profile?.id ?? null
    }
  });

  const serviceId = watch("servicio_id");
  const startTime = watch("hora_inicio");

  useEffect(() => {
    const duration = serviceMap.get(serviceId)?.duracion_aproximada;
    if (duration && startTime && !appointment) {
      setValue("hora_fin", addMinutesToTime(startTime, duration));
    }
  }, [appointment, serviceId, serviceMap, setValue, startTime]);

  const mutation = useMutation({
    mutationFn: async (values: AppointmentFormValues) => {
      let pacienteId = values.paciente_id;

      if (!appointment && patientMode === "quick") {
        const patientPayload: PatientFormValues = {
          nombres: quickPatient.nombres.trim(),
          apellidos: quickPatient.apellidos.trim(),
          telefono: quickPatient.telefono.trim(),
          dni: quickPatient.dni.trim() || null,
          telefono_alternativo: null,
          fecha_nacimiento: null,
          sexo: "no_indica",
          direccion: null,
          observaciones: "Registrado desde nueva cita",
          sede_de_registro_id: values.sede_id,
          creado_por: profile?.id ?? null
        };

        const patient = await createPatient(patientPayload);
        pacienteId = patient.id;
      }

      const payload = { ...values, paciente_id: pacienteId, profesional_id: values.profesional_id || null };
      return appointment ? updateAppointment(appointment.id, payload) : createAppointment(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["patient-options"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["clinical-history"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo guardar la cita")
  });

  return (
    <Modal
      title={appointment ? "Editar cita" : "Nueva cita"}
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="appointment-form" type="submit" variant="primary" disabled={mutation.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="appointment-form" className="form-grid" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        {error ? <div className="alert span-2">{error}</div> : null}
        {!appointment ? (
          <div className="span-2 inline">
            <Button
              type="button"
              variant={patientMode === "existing" ? "primary" : "default"}
              onClick={() => setPatientMode("existing")}
            >
              Paciente existente
            </Button>
            <Button
              type="button"
              variant={patientMode === "quick" ? "primary" : "default"}
              onClick={() => setPatientMode("quick")}
            >
              Paciente nuevo
            </Button>
          </div>
        ) : null}
        {patientMode === "quick" && !appointment ? (
          <div className="span-2 quick-panel">
            <Field label="Nombres">
              <Input
                value={quickPatient.nombres}
                onChange={(event) => setQuickPatient((patient) => ({ ...patient, nombres: event.target.value }))}
                required
              />
            </Field>
            <Field label="Apellidos">
              <Input
                value={quickPatient.apellidos}
                onChange={(event) => setQuickPatient((patient) => ({ ...patient, apellidos: event.target.value }))}
                required
              />
            </Field>
            <Field label="Telefono">
              <Input
                value={quickPatient.telefono}
                onChange={(event) => setQuickPatient((patient) => ({ ...patient, telefono: event.target.value }))}
                required
              />
            </Field>
            <Field label="DNI opcional">
              <Input
                value={quickPatient.dni}
                onChange={(event) => setQuickPatient((patient) => ({ ...patient, dni: event.target.value }))}
              />
            </Field>
          </div>
        ) : null}
        <div style={{ display: patientMode === "quick" && !appointment ? "none" : "block" }}>
          <Field label="Paciente" error={errors.paciente_id?.message}>
          <Select {...register("paciente_id")}>
            <option value="">Seleccionar</option>
            {(patientsQuery.data?.data ?? []).map((patient) => (
              <option key={patient.id} value={patient.id}>
                {fullName(patient)} · {patient.telefono}
              </option>
            ))}
          </Select>
        </Field>
        </div>
        <Field label="Sede" error={errors.sede_id?.message}>
          <Select {...register("sede_id")}>
            <option value="">Seleccionar</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Servicio" error={errors.servicio_id?.message}>
          <Select {...register("servicio_id")}>
            <option value="">Seleccionar</option>
            {(servicesQuery.data ?? []).map((service) => (
              <option key={service.id} value={service.id}>
                {service.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Profesional">
          <Select {...register("profesional_id")}>
            <option value="">Sin asignar</option>
            {(professionalsQuery.data ?? []).map((professional) => (
              <option key={professional.id} value={professional.id}>
                {fullName(professional)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha" error={errors.fecha?.message}>
          <Input type="date" {...register("fecha")} />
        </Field>
        <Field label="Hora inicio" error={errors.hora_inicio?.message}>
          <Input type="time" {...register("hora_inicio")} />
        </Field>
        <Field label="Hora fin" error={errors.hora_fin?.message}>
          <Input type="time" {...register("hora_fin")} />
        </Field>
        <Field label="Estado">
          <Select {...register("estado")}>
            {APPOINTMENT_STATUSES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="field span-2">
          <label>Diagnostico</label>
          <Textarea {...register("diagnostico")} />
        </div>
        <div className="field span-2">
          <label>Tratamiento previsto</label>
          <Textarea {...register("tratamiento")} />
        </div>
        <div className="field span-2">
          <label>Observaciones</label>
          <Textarea {...register("observaciones")} />
        </div>
      </form>
    </Modal>
  );
}
