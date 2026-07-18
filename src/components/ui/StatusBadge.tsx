import { APPOINTMENT_STATUS_LABELS, REMINDER_STATUS_LABELS } from "../../constants";
import type { EstadoCita, EstadoRecordatorio } from "../../types/domain";

export function AppointmentStatusBadge({ status }: { status: EstadoCita }) {
  return <span className={`status status--${status}`}>{APPOINTMENT_STATUS_LABELS[status]}</span>;
}

export function ReminderStatusBadge({ status }: { status: EstadoRecordatorio }) {
  return <span className={`status status--${status}`}>{REMINDER_STATUS_LABELS[status]}</span>;
}
