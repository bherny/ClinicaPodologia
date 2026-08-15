import { useEffect, useMemo, useState, type ReactNode } from "react";
import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Banknote,
  BarChart3,
  CalendarCheck2,
  Download,
  FileDown,
  LockKeyhole,
  RefreshCcw,
  Send,
  ShieldAlert,
  TrendingUp,
  UserPlus,
  XCircle
} from "lucide-react";
import { MusaReportAccessGate } from "../components/reports/MusaReportAccessGate";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Select } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";
import { TableSkeleton } from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { useBranch } from "../context/BranchContext";
import { todayISO } from "../lib/date";
import {
  downloadOperationalReportCsv,
  downloadOperationalReportPdf,
  reportPeriodLabel
} from "../lib/reportExport";
import type { OperationalReport, ReportChartItem, ReportMode } from "../lib/reporting";
import { queryClient } from "../lib/queryClient";
import { playUiSound } from "../lib/sound";
import { getOperationalReport } from "../services/reports";
import { getMusaReportSecurityStatus, lockMusaReportAccess } from "../services/reportSecurity";

function currency(value: number) {
  return value.toLocaleString("es-PE", { style: "currency", currency: "PEN" });
}

export function ReportsPage() {
  const { profile } = useAuth();
  const { branches, selectedBranchId, setSelectedBranchId, canSelectAll } = useBranch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<ReportMode>("daily");
  const [referenceDate, setReferenceDate] = useState(todayISO());
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const musaBranch = branches.find((branch) => branch.nombre.trim().toLocaleLowerCase("es-PE") === "musa");
  const isMusaSelected = selectedBranchId === musaBranch?.id;

  const range = useMemo(() => {
    if (mode === "daily") return { from: referenceDate, to: referenceDate };
    const date = parseISO(referenceDate.slice(0, 7) + "-01");
    return {
      from: format(startOfMonth(date), "yyyy-MM-dd"),
      to: format(endOfMonth(date), "yyyy-MM-dd")
    };
  }, [mode, referenceDate]);

  const reportSecurityQuery = useQuery({
    queryKey: ["musa-report-security", profile?.id],
    queryFn: getMusaReportSecurityStatus,
    enabled: Boolean(profile && profile.rol !== "profesional" && musaBranch && isMusaSelected),
    retry: false,
    refetchInterval: 15_000
  });
  const musaReportAuthorized = isMusaSelected && (reportSecurityQuery.data?.autorizado ?? false);

  const reportQuery = useQuery({
    queryKey: ["operational-report", selectedBranchId, mode, range.from, range.to, musaReportAuthorized],
    queryFn: () => getOperationalReport(selectedBranchId, mode, range.from, range.to),
    enabled: Boolean(profile && profile.rol !== "profesional" && (!isMusaSelected || musaReportAuthorized))
  });

  const lockMutation = useMutation({
    mutationFn: lockMusaReportAccess,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["musa-report-security"] });
      queryClient.removeQueries({ queryKey: ["operational-report", musaBranch?.id] });
      playUiSound("success");
    },
    onError: () => playUiSound("error")
  });

  useEffect(() => {
    if (!isMusaSelected || !musaReportAuthorized) return;
    return () => {
      void lockMusaReportAccess().catch(() => undefined);
    };
  }, [isMusaSelected, musaReportAuthorized]);

  if (profile?.rol === "profesional") return <Navigate to="/" replace />;

  if (isMusaSelected && reportSecurityQuery.isLoading) {
    return <main className="page"><PageHeader eyebrow="Control de gestion" title="Reportes de Musa" description="Verificando autorizacion de la sede." /><TableSkeleton rows={6} /></main>;
  }

  if (isMusaSelected && reportSecurityQuery.error) {
    return <main className="page"><PageHeader eyebrow="Control de gestion" title="Reportes de Musa" description="Informacion protegida por PIN." /><div className="alert">{reportSecurityQuery.error instanceof Error ? reportSecurityQuery.error.message : "No se pudo verificar el acceso a los reportes de Musa."}</div></main>;
  }

  if (isMusaSelected && reportSecurityQuery.data && !musaReportAuthorized) {
    return (
      <main className="page">
        <PageHeader eyebrow="Control de gestion" title="Reportes de Musa" description="Los indicadores de esta sede estan protegidos por el PIN de Musa." />
        <MusaReportAccessGate
          status={reportSecurityQuery.data}
          isAdministrator={profile?.rol === "administrador"}
          onUnlocked={() => {
            queryClient.invalidateQueries({ queryKey: ["musa-report-security"] });
            queryClient.invalidateQueries({ queryKey: ["operational-report", selectedBranchId] });
          }}
          onConfigure={() => navigate("/administracion?seccion=seguridad")}
        />
      </main>
    );
  }

  const report = reportQuery.data;
  const branchLabel = selectedBranchId === "all"
    ? "Todas las sedes (Musa excluida)"
    : branches.find((branch) => branch.id === selectedBranchId)?.nombre ?? "Sede seleccionada";
  const exportCsv = () => {
    if (!report) return;
    downloadOperationalReportCsv(report, branchLabel);
    playUiSound("success");
  };

  const downloadPdf = async () => {
    if (!report || isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    try {
      await downloadOperationalReportPdf(report, branchLabel);
      playUiSound("success");
    } catch {
      playUiSound("error");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <main className="page reports-page">
      <PageHeader
        eyebrow="Control de gestion"
        title={isMusaSelected ? "Reportes de Musa" : "Reportes operativos"}
        description={isMusaSelected
          ? "Indicadores exclusivos de Musa, protegidos por PIN y separados del consolidado."
          : "Indicadores diarios y mensuales de las sedes, sin incluir la informacion protegida de Musa."}
        action={
          <div className="inline report-actions">
            {musaReportAuthorized ? (
              <Button type="button" onClick={() => lockMutation.mutate()} disabled={lockMutation.isPending}>
                <LockKeyhole /> {lockMutation.isPending ? "Bloqueando..." : "Bloquear Musa"}
              </Button>
            ) : null}
            <Button type="button" onClick={exportCsv} disabled={!report}>
              <Download /> Descargar CSV
            </Button>
            <Button type="button" variant="primary" onClick={() => void downloadPdf()} disabled={!report || isDownloadingPdf}>
              <FileDown /> {isDownloadingPdf ? "Preparando PDF..." : "Descargar PDF"}
            </Button>
          </div>
        }
      />

      {selectedBranchId === "all" && musaBranch ? (
        <div className="alert alert--info cash-security-notice">
          <ShieldAlert />
          <span>Por seguridad, la sede Musa no participa en el reporte consolidado.</span>
          <Button type="button" onClick={() => setSelectedBranchId(musaBranch.id)}>Abrir reportes Musa</Button>
        </div>
      ) : null}

      <section className="report-toolbar" aria-label="Filtros del reporte">
        <div className="report-mode" role="group" aria-label="Periodo">
          <button
            type="button"
            className={mode === "daily" ? "is-active" : ""}
            aria-pressed={mode === "daily"}
            onClick={() => setMode("daily")}
          >
            Diario
          </button>
          <button
            type="button"
            className={mode === "monthly" ? "is-active" : ""}
            aria-pressed={mode === "monthly"}
            onClick={() => setMode("monthly")}
          >
            Mensual
          </button>
        </div>

        <label className="report-filter">
          <span>{mode === "daily" ? "Fecha" : "Mes"}</span>
          <Input
            voiceMode="off"
            type={mode === "daily" ? "date" : "month"}
            value={mode === "daily" ? referenceDate : referenceDate.slice(0, 7)}
            onChange={(event) => {
              const value = event.target.value;
              if (value) setReferenceDate(mode === "daily" ? value : value + "-01");
            }}
          />
        </label>

        <label className="report-filter">
          <span>Sede</span>
          <Select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>
            {canSelectAll ? <option value="all">Todas las sedes (sin Musa)</option> : null}
            {branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.nombre}</option>)}
          </Select>
        </label>

        <Button type="button" variant="ghost" onClick={() => void reportQuery.refetch()} disabled={reportQuery.isFetching}>
          <RefreshCcw className={reportQuery.isFetching ? "is-spinning" : ""} />
          Actualizar
        </Button>

        <div className="report-period">
          <span>Periodo analizado</span>
          <strong>{report ? reportPeriodLabel(report) : "Preparando reporte"}</strong>
        </div>
      </section>

      {reportQuery.isError ? (
        <div className="alert" role="alert">
          No se pudo generar el reporte. Verifica la conexion y los permisos de la sede.
        </div>
      ) : reportQuery.isLoading ? (
        <TableSkeleton rows={8} />
      ) : report ? (
        <ReportDashboard report={report} />
      ) : null}
    </main>
  );
}

function ReportDashboard({ report }: { report: OperationalReport }) {
  const summary = report.summary;

  return (
    <div className="report-dashboard">
      <section className="report-metrics" aria-label="Indicadores del reporte">
        <ReportMetric icon={<CalendarCheck2 />} label="Citas" value={summary.appointments.toLocaleString("es-PE")} detail={summary.attendanceRate + "% atendidas"} tone="blue" />
        <ReportMetric icon={<TrendingUp />} label="Atendidas" value={summary.attended.toLocaleString("es-PE")} detail={summary.confirmed + " confirmadas"} tone="teal" />
        <ReportMetric icon={<XCircle />} label="Canceladas / no asistio" value={summary.cancelled.toLocaleString("es-PE")} detail={summary.cancellationRate + "% del total"} tone="coral" />
        <ReportMetric icon={<UserPlus />} label="Pacientes nuevos" value={summary.newPatients.toLocaleString("es-PE")} detail="Registrados en el periodo" tone="lilac" />
        <ReportMetric icon={<Send />} label="Recordatorios pendientes" value={summary.pendingReminders.toLocaleString("es-PE")} detail={summary.remindersSent + " enviados"} tone="amber" />
        <ReportMetric icon={<Banknote />} label="Ingresos registrados" value={currency(summary.revenue)} detail={summary.sales + " ventas pagadas"} tone="navy" />
      </section>

      <section className="report-finance-strip" aria-label="Resumen financiero">
        <div><span>Ticket promedio</span><strong>{currency(summary.averageTicket)}</strong></div>
        <div><span>Descuentos registrados</span><strong>{currency(summary.discounts)}</strong></div>
        <div><span>Ventas pagadas</span><strong>{summary.sales}</strong></div>
      </section>

      <div className="report-grid">
        <Card title="Actividad del periodo" className="report-card report-card--wide">
          <ActivityChart report={report} />
        </Card>
        <Card title="Citas por estado" className="report-card">
          <HorizontalBars items={report.statusBreakdown} emptyLabel="No hay citas en este periodo" />
        </Card>
        <Card title="Servicios mas solicitados" className="report-card">
          <HorizontalBars items={report.serviceBreakdown} emptyLabel="No hay servicios registrados" />
        </Card>
        <Card title="Ingresos por medio de pago" className="report-card">
          <HorizontalBars
            items={report.paymentBreakdown}
            emptyLabel="No hay ventas pagadas"
            detail={(item) => currency(item.amount ?? 0)}
          />
        </Card>
      </div>

      <Card
        title="Comparativo por sede"
        action={<span className="report-table-caption">Datos consolidados del periodo</span>}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sede</th>
                <th>Citas</th>
                <th>Atendidas</th>
                <th>Confirmadas</th>
                <th>Canceladas / no asistio</th>
                <th>Pacientes nuevos</th>
                <th>Recordatorios pendientes</th>
                <th>Ventas</th>
                <th>Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {report.branchBreakdown.map((row) => (
                <tr key={row.branchId}>
                  <td data-label="Sede"><strong>{row.branchName}</strong></td>
                  <td data-label="Citas">{row.appointments}</td>
                  <td data-label="Atendidas">{row.attended}</td>
                  <td data-label="Confirmadas">{row.confirmed}</td>
                  <td data-label="Canceladas / no asistio">{row.cancelled}</td>
                  <td data-label="Pacientes nuevos">{row.newPatients}</td>
                  <td data-label="Recordatorios pendientes">{row.pendingReminders}</td>
                  <td data-label="Ventas">{row.sales}</td>
                  <td data-label="Ingresos"><strong>{currency(row.revenue)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ReportMetric({
  icon,
  label,
  value,
  detail,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "teal" | "coral" | "lilac" | "amber" | "navy";
}) {
  return (
    <article className={"report-metric report-metric--" + tone}>
      <span className="report-metric__icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function HorizontalBars({
  items,
  emptyLabel,
  detail
}: {
  items: ReportChartItem[];
  emptyLabel: string;
  detail?: (item: ReportChartItem) => string;
}) {
  const visibleItems = items.filter((item) => item.value > 0 || (item.amount ?? 0) > 0);
  const maximum = Math.max(...visibleItems.map((item) => item.amount ?? item.value), 1);

  if (!visibleItems.length) return <div className="report-chart-empty"><BarChart3 />{emptyLabel}</div>;

  return (
    <div className="report-bars">
      {visibleItems.map((item) => {
        const measure = item.amount ?? item.value;
        const width = Math.max((measure / maximum) * 100, 4);
        return (
          <div className="report-bar" key={item.key}>
            <div className="report-bar__label">
              <span>{item.label}</span>
              <strong>{detail ? detail(item) : item.value}</strong>
            </div>
            <div className="report-bar__track"><span style={{ width: width + "%" }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityChart({ report }: { report: OperationalReport }) {
  const maxAppointments = Math.max(...report.activityTrend.map((item) => item.appointments), 1);
  const maxRevenue = Math.max(...report.activityTrend.map((item) => item.revenue), 1);

  return (
    <div>
      <div className="report-chart-legend">
        <span><i className="report-chart-legend__appointments" /> Citas</span>
        <span><i className="report-chart-legend__revenue" /> Ingresos</span>
      </div>
      <div className="report-trend-scroll">
        <div className="report-trend" style={{ minWidth: Math.max(report.activityTrend.length * 34, 520) }}>
          {report.activityTrend.map((item) => (
            <div className="report-trend__column" key={item.key} title={item.label + ": " + item.appointments + " citas, " + currency(item.revenue)}>
              <div className="report-trend__bars">
                <span
                  className="report-trend__bar report-trend__bar--appointments"
                  style={{ height: Math.max((item.appointments / maxAppointments) * 100, item.appointments ? 6 : 0) + "%" }}
                />
                <span
                  className="report-trend__bar report-trend__bar--revenue"
                  style={{ height: Math.max((item.revenue / maxRevenue) * 100, item.revenue ? 6 : 0) + "%" }}
                />
              </div>
              <small>{item.label}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}