import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Send,
  UserPlus,
  Users,
  XCircle
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { TableSkeleton } from "../components/ui/Skeleton";
import { AppointmentStatusBadge } from "../components/ui/StatusBadge";
import { useBranch } from "../context/BranchContext";
import { useAuth } from "../context/AuthContext";
import { getDashboardData } from "../services/dashboard";
import { fullName } from "../lib/format";
import { toReadableDate, toReadableTime, tomorrowISO } from "../lib/date";

export function DashboardPage() {
  const { selectedBranchId } = useBranch();
  const { profile } = useAuth();
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", selectedBranchId],
    queryFn: () => getDashboardData(selectedBranchId)
  });

  const data = dashboardQuery.data;
  const firstName = profile?.nombres?.split(" ")[0] || "equipo";
  const tomorrowPending = (data?.pendingReminders ?? []).filter((appointment) => appointment.fecha === tomorrowISO());

  return (
    <main className="page dashboard-page">
      <section className="dashboard-welcome">
        <div>
          <p className="eyebrow">Panel principal</p>
          <h1>Bienvenido, {firstName}</h1>
          <p>Resumen operativo de citas, pacientes y recordatorios de Body Feet.</p>
        </div>
        <div className="dashboard-welcome__actions">
          <Link className="button dashboard-action dashboard-action--patient" to="/pacientes" state={{ openNewPatient: true }}>
            <UserPlus />
            Registrar paciente
          </Link>
          <Link className="button button--primary dashboard-action" to="/citas" state={{ openNewAppointment: true }}>
            <CalendarPlus />
            Nueva cita
          </Link>
        </div>
      </section>

      {dashboardQuery.isError ? (
        <div className="alert">No se pudo cargar el resumen. Revisa la conexion e intenta nuevamente.</div>
      ) : dashboardQuery.isLoading ? (
        <TableSkeleton rows={8} />
      ) : (
        <div className="dashboard-content">
          <section className="dashboard-metrics" aria-label="Indicadores principales">
            <Metric
              label="Citas de hoy"
              value={data?.todayAppointments.length ?? 0}
              hint="Agenda del dia"
              icon={<CalendarDays />}
              tone="teal"
            />
            <Metric
              label="Pacientes registrados"
              value={data?.totalPatientsCount ?? 0}
              hint={`+${data?.newPatientsCount ?? 0} registrados hoy`}
              icon={<Users />}
              tone="blue"
            />
            <Metric
              label="Citas pendientes"
              value={data?.byStatus.pendiente ?? 0}
              hint="Proximos 7 dias"
              icon={<Clock3 />}
              tone="coral"
            />
            <Metric
              label="Recordatorios por enviar"
              value={data?.pendingReminders.length ?? 0}
              hint="Requieren seguimiento"
              icon={<Send />}
              tone="lilac"
            />
          </section>

          <section className="dashboard-status-strip" aria-label="Resumen por estado">
            <StatusSummary icon={<CheckCircle2 />} label="Confirmadas" value={data?.byStatus.confirmada ?? 0} tone="success" />
            <StatusSummary icon={<Activity />} label="Atendidas" value={data?.byStatus.atendida ?? 0} tone="blue" />
            <StatusSummary icon={<XCircle />} label="Canceladas" value={data?.byStatus.cancelada ?? 0} tone="danger" />
          </section>

          <div className="dashboard-grid">
            <Card
              className="dashboard-appointments"
              title="Proximas citas"
              action={<Link className="text-link" to="/citas">Ver agenda <ArrowRight /></Link>}
            >
              {(data?.appointments ?? []).length ? (
                <div className="appointment-list">
                  {(data?.appointments ?? []).slice(0, 7).map((appointment) => (
                    <article className="appointment-row" key={appointment.id}>
                      <div className="appointment-row__date">
                        <strong>{toReadableDate(appointment.fecha)}</strong>
                        <span>{toReadableTime(appointment.hora_inicio)}</span>
                      </div>
                      <div className="appointment-row__patient">
                        <strong>{fullName(appointment.paciente)}</strong>
                        <span>{appointment.servicio?.nombre || "Servicio sin asignar"}</span>
                      </div>
                      <div className="appointment-row__meta">
                        <span>{appointment.sede?.nombre}</span>
                        <AppointmentStatusBadge status={appointment.estado} />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <DashboardEmpty
                  icon={<CalendarDays />}
                  title="No hay citas proximas"
                  description="La agenda de los siguientes siete dias esta libre."
                />
              )}
            </Card>

            <div className="dashboard-side">
              <Card
                title="Pacientes recientes"
                action={<Link className="text-link" to="/pacientes">Ver todos <ArrowRight /></Link>}
              >
                {(data?.recentPatients ?? []).length ? (
                  <div className="patient-list">
                    {(data?.recentPatients ?? []).map((patient) => {
                      const initials = `${patient.nombres.charAt(0)}${patient.apellidos.charAt(0)}`.toUpperCase();
                      const searchValue = patient.dni || patient.telefono || fullName(patient);
                      return (
                        <Link className="patient-row" to={`/pacientes?buscar=${encodeURIComponent(searchValue)}`} key={patient.id}>
                          <span className="patient-row__avatar">{initials}</span>
                          <span className="patient-row__identity">
                            <strong>{fullName(patient)}</strong>
                            <small>{patient.dni ? `DNI ${patient.dni}` : patient.telefono}</small>
                          </span>
                          <span className="patient-row__date">{toReadableDate(patient.created_at.slice(0, 10))}</span>
                          <ArrowRight />
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <DashboardEmpty icon={<Users />} title="Sin pacientes recientes" />
                )}
              </Card>

              <section className={`reminder-panel ${tomorrowPending.length ? "reminder-panel--pending" : ""}`}>
                <div className="reminder-panel__icon"><MessageCircle /></div>
                <div>
                  <span>Recordatorios de manana</span>
                  <strong>
                    {tomorrowPending.length
                      ? `${tomorrowPending.length} ${tomorrowPending.length === 1 ? "paciente pendiente" : "pacientes pendientes"}`
                      : "Todo esta al dia"}
                  </strong>
                  <p>
                    {tomorrowPending.length
                      ? "Contactalos para confirmar su asistencia."
                      : "No hay citas de manana sin recordatorio."}
                  </p>
                </div>
                <Link to="/recordatorios" aria-label="Abrir recordatorios"><ArrowRight /></Link>
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Metric({
  label,
  value,
  hint,
  icon,
  tone
}: {
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
  tone: "teal" | "blue" | "coral" | "lilac";
}) {
  return (
    <article className="dashboard-metric">
      <span className={`dashboard-metric__icon dashboard-metric__icon--${tone}`}>{icon}</span>
      <div>
        <span className="dashboard-metric__label">{label}</span>
        <strong className="dashboard-metric__value">{value.toLocaleString("es-PE")}</strong>
        <small>{hint}</small>
      </div>
    </article>
  );
}

function StatusSummary({
  icon,
  label,
  value,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: "success" | "blue" | "danger";
}) {
  return (
    <div className={`status-summary status-summary--${tone}`}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DashboardEmpty({
  icon,
  title,
  description
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="dashboard-empty">
      {icon}
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
    </div>
  );
}
