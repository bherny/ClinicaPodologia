import { describe, expect, it } from "vitest";
import { buildOperationalReport, type ReportSourceData } from "./reporting";

const source: ReportSourceData = {
  branches: [
    { id: "musa", name: "Musa" },
    { id: "manchay", name: "Manchay" }
  ],
  appointments: [
    {
      id: "c1",
      date: "2026-08-15",
      startTime: "09:00",
      status: "atendida",
      branchId: "musa",
      branchName: "Musa",
      serviceName: "Podologia"
    },
    {
      id: "c2",
      date: "2026-08-15",
      startTime: "10:00",
      status: "pendiente",
      branchId: "manchay",
      branchName: "Manchay",
      serviceName: "Terapia Fisica"
    },
    {
      id: "c3",
      date: "2026-08-15",
      startTime: "11:00",
      status: "cancelada",
      branchId: "musa",
      branchName: "Musa",
      serviceName: "Podologia"
    }
  ],
  patients: [
    { id: "p1", createdAt: "2026-08-15T08:00:00", branchId: "musa", branchName: "Musa" }
  ],
  reminders: [
    { id: "r1", appointmentId: "c1", status: "enviado", branchId: "musa" }
  ],
  sales: [
    {
      id: "v1",
      date: "2026-08-15T09:30:00",
      status: "pagada",
      paymentMethod: "yape",
      total: 120,
      discount: 10,
      branchId: "musa",
      branchName: "Musa"
    },
    {
      id: "v2",
      date: "2026-08-15T10:30:00",
      status: "anulada",
      paymentMethod: "efectivo",
      total: 80,
      discount: 0,
      branchId: "manchay",
      branchName: "Manchay"
    }
  ]
};

describe("operational report", () => {
  it("calculates clinic and financial totals without counting voided sales", () => {
    const report = buildOperationalReport(source, "daily", "2026-08-15", "2026-08-15");

    expect(report.summary.appointments).toBe(3);
    expect(report.summary.attended).toBe(1);
    expect(report.summary.cancelled).toBe(1);
    expect(report.summary.newPatients).toBe(1);
    expect(report.summary.sales).toBe(1);
    expect(report.summary.revenue).toBe(120);
    expect(report.summary.discounts).toBe(10);
  });

  it("detects active appointments that still need a reminder", () => {
    const report = buildOperationalReport(source, "daily", "2026-08-15", "2026-08-15");

    expect(report.summary.pendingReminders).toBe(1);
    expect(report.branchBreakdown.find((row) => row.branchId === "manchay")?.pendingReminders).toBe(1);
  });

  it("groups appointments by status, service and branch", () => {
    const report = buildOperationalReport(source, "daily", "2026-08-15", "2026-08-15");

    expect(report.statusBreakdown.find((item) => item.key === "atendida")?.value).toBe(1);
    expect(report.serviceBreakdown[0]).toMatchObject({ label: "Podologia", value: 2 });
    expect(report.branchBreakdown.find((row) => row.branchId === "musa")?.appointments).toBe(2);
  });
});