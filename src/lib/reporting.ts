import { eachDayOfInterval, format, parseISO } from "date-fns";
import { APPOINTMENT_STATUS_LABELS } from "../constants";
import type { EstadoCita, EstadoRecordatorio, EstadoVenta, MetodoPago } from "../types/domain";

export type ReportMode = "daily" | "monthly";

export type ReportBranchSource = {
  id: string;
  name: string;
};

export type ReportAppointmentSource = {
  id: string;
  date: string;
  startTime: string;
  status: EstadoCita;
  branchId: string;
  branchName: string;
  serviceName: string;
};

export type ReportPatientSource = {
  id: string;
  createdAt: string;
  branchId: string;
  branchName: string;
};

export type ReportReminderSource = {
  id: string;
  appointmentId: string;
  status: EstadoRecordatorio;
  branchId: string;
};

export type ReportSaleSource = {
  id: string;
  date: string;
  status: EstadoVenta;
  paymentMethod: MetodoPago;
  total: number;
  discount: number;
  branchId: string;
  branchName: string;
};

export type ReportSourceData = {
  branches: ReportBranchSource[];
  appointments: ReportAppointmentSource[];
  patients: ReportPatientSource[];
  reminders: ReportReminderSource[];
  sales: ReportSaleSource[];
};

export type ReportChartItem = {
  key: string;
  label: string;
  value: number;
  amount?: number;
};

export type ReportTrendItem = {
  key: string;
  label: string;
  appointments: number;
  revenue: number;
};

export type ReportBranchRow = {
  branchId: string;
  branchName: string;
  appointments: number;
  attended: number;
  confirmed: number;
  cancelled: number;
  newPatients: number;
  pendingReminders: number;
  sales: number;
  revenue: number;
};

export type OperationalReport = {
  mode: ReportMode;
  from: string;
  to: string;
  generatedAt: string;
  summary: {
    appointments: number;
    attended: number;
    confirmed: number;
    cancelled: number;
    attendanceRate: number;
    cancellationRate: number;
    newPatients: number;
    remindersSent: number;
    pendingReminders: number;
    sales: number;
    revenue: number;
    discounts: number;
    averageTicket: number;
  };
  statusBreakdown: ReportChartItem[];
  serviceBreakdown: ReportChartItem[];
  paymentBreakdown: ReportChartItem[];
  branchBreakdown: ReportBranchRow[];
  activityTrend: ReportTrendItem[];
};

const SENT_REMINDER_STATUSES = new Set<EstadoRecordatorio>([
  "enviado",
  "pendiente_respuesta",
  "confirmado",
  "reprogramado",
  "cancelado"
]);

const PAYMENT_LABELS: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  mixto: "Mixto",
  otro: "Otro"
};

function percentage(value: number, total: number) {
  return total ? Math.round((value / total) * 1000) / 10 : 0;
}

function createBranchRow(branchId: string, branchName: string): ReportBranchRow {
  return {
    branchId,
    branchName,
    appointments: 0,
    attended: 0,
    confirmed: 0,
    cancelled: 0,
    newPatients: 0,
    pendingReminders: 0,
    sales: 0,
    revenue: 0
  };
}

function hourKey(value: string) {
  const hour = Number(value.slice(0, 2));
  return Number.isFinite(hour) ? String(hour).padStart(2, "0") : "00";
}

function saleHourKey(value: string) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return String(parsed.getHours()).padStart(2, "0");
  return hourKey(value.slice(11, 16));
}

function createTrend(mode: ReportMode, from: string, to: string) {
  const trend = new Map<string, ReportTrendItem>();

  if (mode === "daily") {
    for (let hour = 7; hour <= 20; hour += 1) {
      const key = String(hour).padStart(2, "0");
      trend.set(key, { key, label: key + ":00", appointments: 0, revenue: 0 });
    }
    return trend;
  }

  eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).forEach((date) => {
    const key = format(date, "yyyy-MM-dd");
    trend.set(key, { key, label: format(date, "dd"), appointments: 0, revenue: 0 });
  });
  return trend;
}

export function buildOperationalReport(
  source: ReportSourceData,
  mode: ReportMode,
  from: string,
  to: string
): OperationalReport {
  const branchRows = new Map<string, ReportBranchRow>();
  source.branches.forEach((branch) => branchRows.set(branch.id, createBranchRow(branch.id, branch.name)));

  const ensureBranch = (branchId: string, branchName: string) => {
    const existing = branchRows.get(branchId);
    if (existing) return existing;
    const created = createBranchRow(branchId, branchName || "Sede sin nombre");
    branchRows.set(branchId, created);
    return created;
  };

  const statusCounts = new Map<EstadoCita, number>();
  (Object.keys(APPOINTMENT_STATUS_LABELS) as EstadoCita[]).forEach((status) => statusCounts.set(status, 0));
  const serviceCounts = new Map<string, number>();
  const paymentCounts = new Map<MetodoPago, { count: number; amount: number }>();
  const trend = createTrend(mode, from, to);

  source.appointments.forEach((appointment) => {
    statusCounts.set(appointment.status, (statusCounts.get(appointment.status) ?? 0) + 1);
    serviceCounts.set(appointment.serviceName, (serviceCounts.get(appointment.serviceName) ?? 0) + 1);

    const branch = ensureBranch(appointment.branchId, appointment.branchName);
    branch.appointments += 1;
    if (appointment.status === "atendida") branch.attended += 1;
    if (appointment.status === "confirmada") branch.confirmed += 1;
    if (appointment.status === "cancelada" || appointment.status === "no_asistio") branch.cancelled += 1;

    const key = mode === "daily" ? hourKey(appointment.startTime) : appointment.date;
    const item = trend.get(key) ?? {
      key,
      label: mode === "daily" ? key + ":00" : appointment.date.slice(8, 10),
      appointments: 0,
      revenue: 0
    };
    item.appointments += 1;
    trend.set(key, item);
  });

  source.patients.forEach((patient) => {
    ensureBranch(patient.branchId, patient.branchName).newPatients += 1;
  });

  const sentAppointmentIds = new Set(
    source.reminders
      .filter((reminder) => SENT_REMINDER_STATUSES.has(reminder.status))
      .map((reminder) => reminder.appointmentId)
  );

  source.appointments
    .filter((appointment) => ["pendiente", "confirmada"].includes(appointment.status))
    .filter((appointment) => !sentAppointmentIds.has(appointment.id))
    .forEach((appointment) => {
      ensureBranch(appointment.branchId, appointment.branchName).pendingReminders += 1;
    });

  const paidSales = source.sales.filter((sale) => sale.status === "pagada");
  paidSales.forEach((sale) => {
    const branch = ensureBranch(sale.branchId, sale.branchName);
    branch.sales += 1;
    branch.revenue += sale.total;

    const payment = paymentCounts.get(sale.paymentMethod) ?? { count: 0, amount: 0 };
    payment.count += 1;
    payment.amount += sale.total;
    paymentCounts.set(sale.paymentMethod, payment);

    const key = mode === "daily" ? saleHourKey(sale.date) : sale.date.slice(0, 10);
    const item = trend.get(key) ?? {
      key,
      label: mode === "daily" ? key + ":00" : sale.date.slice(8, 10),
      appointments: 0,
      revenue: 0
    };
    item.revenue += sale.total;
    trend.set(key, item);
  });

  const appointments = source.appointments.length;
  const attended = statusCounts.get("atendida") ?? 0;
  const confirmed = statusCounts.get("confirmada") ?? 0;
  const cancelled = (statusCounts.get("cancelada") ?? 0) + (statusCounts.get("no_asistio") ?? 0);
  const revenue = paidSales.reduce((total, sale) => total + sale.total, 0);
  const discounts = paidSales.reduce((total, sale) => total + sale.discount, 0);
  const pendingReminders = Array.from(branchRows.values()).reduce((total, row) => total + row.pendingReminders, 0);

  return {
    mode,
    from,
    to,
    generatedAt: new Date().toISOString(),
    summary: {
      appointments,
      attended,
      confirmed,
      cancelled,
      attendanceRate: percentage(attended, appointments),
      cancellationRate: percentage(cancelled, appointments),
      newPatients: source.patients.length,
      remindersSent: sentAppointmentIds.size,
      pendingReminders,
      sales: paidSales.length,
      revenue,
      discounts,
      averageTicket: paidSales.length ? revenue / paidSales.length : 0
    },
    statusBreakdown: (Object.keys(APPOINTMENT_STATUS_LABELS) as EstadoCita[]).map((status) => ({
      key: status,
      label: APPOINTMENT_STATUS_LABELS[status],
      value: statusCounts.get(status) ?? 0
    })),
    serviceBreakdown: Array.from(serviceCounts.entries())
      .map(([label, value]) => ({ key: label, label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    paymentBreakdown: Array.from(paymentCounts.entries())
      .map(([method, item]) => ({
        key: method,
        label: PAYMENT_LABELS[method],
        value: item.count,
        amount: item.amount
      }))
      .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
    branchBreakdown: Array.from(branchRows.values()).sort((a, b) => a.branchName.localeCompare(b.branchName, "es")),
    activityTrend: Array.from(trend.values()).sort((a, b) => a.key.localeCompare(b.key))
  };
}