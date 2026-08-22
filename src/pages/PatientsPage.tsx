import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Edit, KeyRound, Plus, Printer, RefreshCw, Search, ShieldOff, Trash2 } from "lucide-react";
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
import { useDraft } from "../context/DraftContext";
import { queryClient } from "../lib/queryClient";
import { fullName } from "../lib/format";
import { todayISO, toReadableDate, toReadableTime } from "../lib/date";
import { printPrescription } from "../lib/print";
import { getPatientPrescriptions } from "../services/prescriptions";
import {
  configurePatientPortalPin,
  getPatientPortalAccessStatus,
  revokePatientPortalAccess
} from "../services/patientPortal";
import {
  createPatient,
  getPatientAppointments,
  getPatientClinicalHistory,
  getPatientReminders,
  listPatients,
  patientSchema,
  softDeletePatient,
  updatePatient,
  type PatientFormValues
} from "../services/patients";
import type { PacienteResumen } from "../types/domain";

const patientTabs = ["Informacion personal", "Proximas citas", "Historial de citas", "Historia clinica", "Tratamientos", "Recetas", "Recordatorios"];

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message ?? fallback);
  }
  return fallback;
}

export function PatientsPage() {
  const { selectedBranchId, branches } = useBranch();
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("buscar") ?? "";
  const [search, setSearch] = useState(urlSearch);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<PacienteResumen | null>(null);
  const [detail, setDetail] = useState<PacienteResumen | null>(null);
  const [portalPatient, setPortalPatient] = useState<PacienteResumen | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setSearch(urlSearch);
    setPage(1);
  }, [urlSearch]);

  useEffect(() => {
    const routeState = location.state as { openNewPatient?: boolean } | null;
    if (!routeState?.openNewPatient) return;
    setEditing({} as PacienteResumen);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const patientsQuery = useQuery({
    queryKey: ["patients", search, selectedBranchId, page],
    queryFn: () => listPatients({ search, branchId: selectedBranchId, page })
  });

  const deleteMutation = useMutation({
    mutationFn: softDeletePatient,
    onMutate: async (patientId) => {
      setDeleteError(null);
      await queryClient.cancelQueries({ queryKey: ["patients"] });
      const snapshots = queryClient.getQueriesData<{ data: PacienteResumen[]; count: number }>({ queryKey: ["patients"] });
      snapshots.forEach(([queryKey, value]) => {
        if (!value) return;
        queryClient.setQueryData(queryKey, {
          ...value,
          data: value.data.filter((patient) => patient.id !== patientId),
          count: Math.max(0, value.count - 1)
        });
      });
      return { snapshots };
    },
    onError: (nextError, _patientId, context) => {
      context?.snapshots.forEach(([queryKey, value]) => queryClient.setQueryData(queryKey, value));
      setDeleteError(getErrorMessage(nextError, "No se pudo eliminar el paciente"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    }
  });

  return (
    <main className="page">
      <PageHeader
        eyebrow="Pacientes"
        title="Registro de pacientes"
        description="Busca, registra y consulta la historia completa del paciente sin duplicar fichas entre sedes."
        action={
          <Button type="button" variant="primary" onClick={() => setEditing({} as PacienteResumen)}>
            <Plus />
            Nuevo paciente
          </Button>
        }
      />

      <div className="toolbar">
        <div className="toolbar__filters">
          <div className="field" style={{ minWidth: 300 }}>
            <label>Buscar</label>
            <div className="inline">
              <Search size={17} />
              <Input
                placeholder="Nombre, apellido, DNI o telefono"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {deleteError ? <div className="alert" style={{ marginBottom: 14 }}>{deleteError}</div> : null}

      <Card>
        {patientsQuery.isLoading ? (
          <TableSkeleton />
        ) : patientsQuery.data?.data.length ? (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>DNI</th>
                    <th>Telefono</th>
                    <th>Sede registro</th>
                    <th>Observaciones</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {patientsQuery.data.data.map((patient) => (
                    <tr key={patient.id}>
                      <td data-label="Paciente">
                        <button className="button button--ghost" type="button" onClick={() => setDetail(patient)}>
                          {fullName(patient)}
                        </button>
                      </td>
                      <td data-label="DNI">{patient.dni ?? "No registrado"}</td>
                      <td data-label="Telefono">{patient.telefono}</td>
                      <td data-label="Sede">{patient.sede?.nombre}</td>
                      <td data-label="Observaciones">{patient.observaciones ?? ""}</td>
                      <td data-label="Acciones">
                        <div className="inline">
                          <Button type="button" onClick={() => setEditing(patient)} aria-label="Editar paciente">
                            <Edit />
                          </Button>
                          {profile?.rol === "administrador" || profile?.rol === "recepcion" ? (
                            <Button
                              type="button"
                              onClick={() => setPortalPatient(patient)}
                              aria-label="Configurar acceso al portal del paciente"
                              title="Configurar acceso al portal"
                            >
                              <KeyRound />
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="danger"
                            onClick={() => {
                              if (confirm("¿Eliminar logicamente este paciente?")) deleteMutation.mutate(patient.id);
                            }}
                            aria-label="Eliminar paciente"
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
            <div className="modal__footer">
              <span className="muted">{patientsQuery.data.count} registros</span>
              <Button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
                Anterior
              </Button>
              <Button type="button" disabled={page * 15 >= patientsQuery.data.count} onClick={() => setPage((value) => value + 1)}>
                Siguiente
              </Button>
            </div>
          </>
        ) : (
          <EmptyState title="No hay pacientes para mostrar" description="Registra el primer paciente o ajusta el filtro de busqueda." />
        )}
      </Card>

      {editing ? (
        <PatientModal
          patient={editing.id ? editing : null}
          branches={branches}
          defaultBranchId={selectedBranchId !== "all" ? selectedBranchId : profile?.sede_id ?? branches[0]?.id}
          profileId={profile?.id}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {detail ? <PatientDetail patient={detail} onClose={() => setDetail(null)} /> : null}
      {portalPatient ? (
        <PatientPortalPinModal patient={portalPatient} onClose={() => setPortalPatient(null)} />
      ) : null}
    </main>
  );
}

function PatientModal({
  patient,
  branches,
  defaultBranchId,
  profileId,
  onClose
}: {
  patient: PacienteResumen | null;
  branches: { id: string; nombre: string }[];
  defaultBranchId?: string | null;
  profileId?: string;
  onClose: () => void;
}) {
  const { draft, recovered, saveDraft, clearDraft } = useDraft<PatientFormValues>("patient:new", !patient);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: patient ? {
      nombres: patient.nombres,
      apellidos: patient.apellidos,
      dni: patient.dni ?? "",
      telefono: patient.telefono,
      telefono_alternativo: patient.telefono_alternativo ?? "",
      fecha_nacimiento: patient.fecha_nacimiento ?? "",
      sexo: patient.sexo ?? "no_indica",
      direccion: patient.direccion ?? "",
      observaciones: patient.observaciones ?? "",
      sede_de_registro_id: patient.sede_de_registro_id,
      creado_por: patient.creado_por ?? profileId ?? null
    } : draft ?? {
      nombres: "",
      apellidos: "",
      dni: "",
      telefono: "",
      telefono_alternativo: "",
      fecha_nacimiento: "",
      sexo: "no_indica",
      direccion: "",
      observaciones: "",
      sede_de_registro_id: defaultBranchId ?? "",
      creado_por: profileId ?? null
    }
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (patient) return;
    const subscription = watch((values) => saveDraft(values as PatientFormValues));
    return () => subscription.unsubscribe();
  }, [patient, saveDraft, watch]);

  const mutation = useMutation({
    mutationFn: (values: PatientFormValues) => (patient ? updatePatient(patient.id, values) : createPatient(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      clearDraft();
      onClose();
    },
    onError: (nextError) => setError(getErrorMessage(nextError, "No se pudo guardar el paciente"))
  });

  return (
    <Modal
      title={patient ? "Editar paciente" : "Nuevo paciente"}
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          {recovered && !patient ? <Button type="button" variant="danger" onClick={() => { clearDraft(); onClose(); }}>Descartar borrador</Button> : null}
          <Button form="patient-form" type="submit" variant="primary" disabled={mutation.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="patient-form" className="form-grid" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        {error ? <div className="alert span-2">{error}</div> : null}
        {recovered && !patient ? <div className="draft-notice span-2">Recuperamos el paciente que dejaste en proceso.</div> : null}
        <Field label="Nombres" error={errors.nombres?.message}>
          <Input {...register("nombres")} />
        </Field>
        <Field label="Apellidos" error={errors.apellidos?.message}>
          <Input {...register("apellidos")} />
        </Field>
        <Field label="DNI">
          <Input {...register("dni")} />
        </Field>
        <Field label="Telefono" error={errors.telefono?.message}>
          <Input {...register("telefono")} />
        </Field>
        <Field label="Telefono alternativo">
          <Input {...register("telefono_alternativo")} />
        </Field>
        <Field label="Fecha de nacimiento">
          <Input type="date" {...register("fecha_nacimiento")} />
        </Field>
        <Field label="Sexo">
          <Select {...register("sexo")}>
            <option value="no_indica">No indica</option>
            <option value="femenino">Femenino</option>
            <option value="masculino">Masculino</option>
            <option value="otro">Otro</option>
          </Select>
        </Field>
        <Field label="Sede de registro" error={errors.sede_de_registro_id?.message}>
          <Select {...register("sede_de_registro_id")}>
            <option value="">Seleccionar</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Direccion">
          <Input {...register("direccion")} />
        </Field>
        <div className="field span-2">
          <label>Observaciones</label>
          <Textarea {...register("observaciones")} />

        </div>
      </form>
    </Modal>
  );
}

function generatePatientPortalPin() {
  const range = 900_000;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  const random = new Uint32Array(1);
  do {
    crypto.getRandomValues(random);
  } while (random[0] >= limit);
  return String(100_000 + (random[0] % range));
}

function PatientPortalPinModal({ patient, onClose }: { patient: PacienteResumen; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [configuredPin, setConfiguredPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["patient-portal-access", patient.id],
    queryFn: () => getPatientPortalAccessStatus(patient.id)
  });

  const configureMutation = useMutation({
    mutationFn: (nextPin: string) => configurePatientPortalPin(patient.id, nextPin),
    onSuccess: (_result, savedPin) => {
      setConfiguredPin(savedPin);
      setPin("");
      setConfirmation("");
      setError(null);
      setNotice("Acceso configurado. Entrega este PIN al paciente de forma privada.");
      queryClient.invalidateQueries({ queryKey: ["patient-portal-access", patient.id] });
    },
    onError: (nextError) => setError(getErrorMessage(nextError, "No se pudo configurar el PIN."))
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokePatientPortalAccess(patient.id),
    onSuccess: () => {
      setConfiguredPin(null);
      setError(null);
      setNotice("El acceso al portal fue desactivado y sus sesiones quedaron cerradas.");
      queryClient.invalidateQueries({ queryKey: ["patient-portal-access", patient.id] });
    },
    onError: (nextError) => setError(getErrorMessage(nextError, "No se pudo desactivar el acceso."))
  });

  const savePin = () => {
    setError(null);
    setNotice(null);
    setConfiguredPin(null);
    if (!/^\d{6,10}$/.test(pin)) {
      setError("El PIN debe tener entre 6 y 10 digitos.");
      return;
    }
    if (pin !== confirmation) {
      setError("La confirmacion no coincide con el PIN.");
      return;
    }
    configureMutation.mutate(pin);
  };

  const generatePin = () => {
    const nextPin = generatePatientPortalPin();
    setPin(nextPin);
    setConfirmation(nextPin);
    setConfiguredPin(null);
    setError(null);
    setNotice("PIN seguro generado. Guarda para activarlo.");
  };

  const copyPin = async () => {
    if (!configuredPin) return;
    try {
      await navigator.clipboard.writeText(configuredPin);
      setNotice("PIN copiado. Compartelo solamente con el paciente.");
    } catch {
      setError("No se pudo copiar. Selecciona el PIN y copialo manualmente.");
    }
  };

  const isBusy = configureMutation.isPending || revokeMutation.isPending;
  const status = statusQuery.data;

  return (
    <Modal
      title="Acceso del paciente"
      onClose={onClose}
      footer={
        <>
          {status?.active ? (
            <Button
              type="button"
              variant="danger"
              disabled={isBusy}
              onClick={() => {
                if (confirm("¿Desactivar el acceso y cerrar todas las sesiones de este paciente?")) {
                  revokeMutation.mutate();
                }
              }}
            >
              <ShieldOff />
              Desactivar acceso
            </Button>
          ) : null}
          <Button type="button" onClick={onClose}>Cerrar</Button>
          <Button form="patient-portal-pin-form" type="submit" variant="primary" disabled={isBusy}>
            <KeyRound />
            {status?.configured ? "Cambiar PIN" : "Activar acceso"}
          </Button>
        </>
      }
    >
      <form
        id="patient-portal-pin-form"
        className="stack portal-pin-form"
        onSubmit={(event) => {
          event.preventDefault();
          savePin();
        }}
      >
        <div className="portal-pin-patient">
          <div>
            <span>Paciente</span>
            <strong>{fullName(patient)}</strong>
          </div>
          <div>
            <span>Telefono registrado</span>
            <strong>{patient.telefono}</strong>
          </div>
        </div>

        {statusQuery.isLoading ? <p className="muted">Consultando acceso...</p> : null}
        {statusQuery.error ? (
          <div className="alert" role="alert">
            {getErrorMessage(statusQuery.error, "No se pudo consultar el acceso.")}
          </div>
        ) : null}
        {status ? (
          <div className={`portal-pin-status${status.active ? " portal-pin-status--active" : ""}`}>
            <KeyRound />
            <div>
              <strong>{status.active ? "Acceso activo" : status.configured ? "Acceso desactivado" : "Acceso sin configurar"}</strong>
              <span>
                {status.blocked_until
                  ? `Bloqueado hasta ${new Date(status.blocked_until).toLocaleString("es-PE")}`
                  : "El paciente ingresara con su telefono y este PIN privado."}
              </span>
            </div>
          </div>
        ) : null}

        {error ? <div className="alert" role="alert">{error}</div> : null}
        {notice ? <div className="alert alert--success" role="status">{notice}</div> : null}

        {configuredPin ? (
          <div className="portal-pin-result">
            <span>PIN para entregar ahora</span>
            <strong>{configuredPin}</strong>
            <Button type="button" onClick={() => void copyPin()}>
              <Copy />
              Copiar PIN
            </Button>
            <small>Por seguridad, este PIN no volvera a mostrarse cuando cierres la ventana.</small>
          </div>
        ) : null}

        <div className="form-grid">
          <Field label="Nuevo PIN">
            <Input
              type="password"
              inputMode="numeric"
              voiceMode="off"
              autoComplete="new-password"
              value={pin}
              maxLength={10}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              placeholder="6 a 10 digitos"
            />
          </Field>
          <Field label="Confirmar PIN">
            <Input
              type="password"
              inputMode="numeric"
              voiceMode="off"
              autoComplete="new-password"
              value={confirmation}
              maxLength={10}
              onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, ""))}
              placeholder="Repite el PIN"
            />
          </Field>
        </div>
        <Button type="button" onClick={generatePin} disabled={isBusy}>
          <RefreshCw />
          Generar PIN seguro
        </Button>
        <p className="muted portal-pin-help">
          Cambiar el PIN cierra las sesiones anteriores. Body Feet guarda un hash, no el PIN legible.
        </p>
      </form>
    </Modal>
  );
}
function PatientDetail({ patient, onClose }: { patient: PacienteResumen; onClose: () => void }) {
  const { profile } = useAuth();
  const tabs = profile?.rol === "recepcion"
    ? patientTabs.filter((tab) => !["Historia clinica", "Tratamientos", "Recetas"].includes(tab))
    : patientTabs;
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const appointmentsQuery = useQuery({
    queryKey: ["patient-appointments", patient.id],
    queryFn: () => getPatientAppointments(patient.id)
  });
  const historyQuery = useQuery({
    queryKey: ["patient-history", patient.id],
    queryFn: () => getPatientClinicalHistory(patient.id)
  });
  const remindersQuery = useQuery({
    queryKey: ["patient-reminders", patient.id],
    queryFn: () => getPatientReminders(patient.id)
  });
  const prescriptionsQuery = useQuery({
    queryKey: ["patient-prescriptions", patient.id],
    queryFn: () => getPatientPrescriptions(patient.id),
    enabled: profile?.rol !== "recepcion"
  });

  const upcoming = useMemo(
    () => (appointmentsQuery.data ?? []).filter((appointment) => appointment.fecha >= todayISO()),
    [appointmentsQuery.data]
  );

  return (
    <Modal title={fullName(patient)} onClose={onClose}>
      <div className="tabs">
        {tabs.map((tab) => (
          <button key={tab} type="button" className={`tab ${activeTab === tab ? "tab--active" : ""}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>
      <div style={{ paddingTop: 16 }}>
        {activeTab === "Informacion personal" ? (
          <dl className="form-grid">
            <div><dt className="muted">DNI</dt><dd>{patient.dni ?? "No registrado"}</dd></div>
            <div><dt className="muted">Telefono</dt><dd>{patient.telefono}</dd></div>
            <div><dt className="muted">Sede de registro</dt><dd>{patient.sede?.nombre}</dd></div>
            <div><dt className="muted">Direccion</dt><dd>{patient.direccion ?? "No registrada"}</dd></div>
            <div className="span-2"><dt className="muted">Observaciones</dt><dd>{patient.observaciones ?? "Sin observaciones"}</dd></div>
          </dl>
        ) : null}
        {activeTab === "Proximas citas" ? <AppointmentsMiniTable appointments={upcoming} /> : null}
        {activeTab === "Historial de citas" ? <AppointmentsMiniTable appointments={appointmentsQuery.data ?? []} /> : null}
        {activeTab === "Historia clinica" ? (
          <div className="stack">
            {(historyQuery.data ?? []).map((item) => (
              <article className="card metric" key={item.id}>
                <strong>{item.diagnostico}</strong>
                <p>{item.tratamiento_realizado}</p>
                <span className="muted">{toReadableDate(item.created_at.slice(0, 10))}</span>
              </article>
            ))}
          </div>
        ) : null}
        {activeTab === "Tratamientos" ? (
          <div className="stack">
            {(historyQuery.data ?? []).map((item) => (
              <article className="card metric" key={item.id}>
                <strong>{item.tratamiento_realizado}</strong>
                <p className="muted">{item.evolucion ?? "Sin evolucion registrada"}</p>
              </article>
            ))}
          </div>
        ) : null}
        {activeTab === "Recetas" ? (
          <div className="stack">
            {(prescriptionsQuery.data ?? []).length ? (prescriptionsQuery.data ?? []).map((prescription) => (
              <article className="card prescription-summary" key={prescription.id}>
                <div>
                  <strong>{toReadableDate(prescription.fecha)}</strong>
                  <p>{prescription.items.map((item) => item.medicamento).join(", ")}</p>
                  <span className="muted">{fullName(prescription.profesional)} · {prescription.sede?.nombre}</span>
                </div>
                <Button type="button" aria-label="Imprimir receta" onClick={() => printPrescription(prescription)}>
                  <Printer />
                </Button>
              </article>
            )) : <EmptyState title="Sin recetas registradas" />}
          </div>
        ) : null}
        {activeTab === "Recordatorios" ? (
          <div className="stack">
            {(remindersQuery.data ?? []).map((item) => (
              <article className="card metric" key={item.id}>
                <ReminderStatusBadge status={item.estado} />
                <p>{item.mensaje}</p>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function AppointmentsMiniTable({ appointments }: { appointments: any[] }) {
  if (!appointments.length) return <EmptyState title="Sin registros" />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Servicio</th>
            <th>Sede</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((appointment) => (
            <tr key={appointment.id}>
              <td>{toReadableDate(appointment.fecha)}</td>
              <td>{toReadableTime(appointment.hora_inicio)}</td>
              <td>{appointment.servicio?.nombre}</td>
              <td>{appointment.sede?.nombre}</td>
              <td><AppointmentStatusBadge status={appointment.estado} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
