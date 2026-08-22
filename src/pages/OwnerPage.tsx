import { ReactNode, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BriefcaseBusiness,
  Camera,
  Clock3,
  Download,
  Image,
  LogIn,
  LogOut,
  UserCheck,
  UserX,
  Users
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Select } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { TableSkeleton } from "../components/ui/Skeleton";
import { OwnerProductsPanel } from "../components/owner/OwnerProductsPanel";
import { OwnerShiftsPanel } from "../components/owner/OwnerShiftsPanel";
import { useAuth } from "../context/AuthContext";
import { useBranch } from "../context/BranchContext";
import { fullName } from "../lib/format";
import { toLimaTime12, toReadableTime12 } from "../lib/date";
import { queryClient } from "../lib/queryClient";
import {
  createAttendanceSignedUrl,
  listAttendance,
  listAttendanceForReport,
  listOwnerShifts,
  subscribeToAttendanceChanges
} from "../services/attendance";
import { listProfessionals } from "../services/catalog";
import type { JornadaAsistenciaDetalle, Profesional, TurnoProfesionalDetalle } from "../types/domain";

type OwnerTab = "dashboard" | "hoy" | "evidencias" | "historial" | "turnos" | "reportes" | "productos";
type EvidenceMeta = { path: string; professional: string; branch: string; type: "Entrada" | "Salida"; at: string };

const TAB_LABELS: Array<[OwnerTab, string]> = [
  ["dashboard", "Dashboard"],
  ["hoy", "Asistencia de hoy"],
  ["evidencias", "Evidencias"],
  ["historial", "Historial"],
  ["turnos", "Turnos"],
  ["reportes", "Reportes"],
  ["productos", "Productos y ventas"]
];


function limaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(date);
}

function readableDateTime(value?: string | null) {
  if (!value) return "--";
  const date = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium"
  }).format(new Date(value));
  return `${date}, ${toLimaTime12(value)}`;
}

function readableTime(value?: string | null) {
  return toLimaTime12(value);
}

function workedTime(minutes?: number | null) {
  if (minutes == null) return "En curso";
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function clockMinutes(value?: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function limaClockMinutes(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(value).split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

function shiftMinutes(shift?: { hora_inicio?: string | null; hora_fin?: string | null } | null) {
  if (!shift) return 0;
  const start = clockMinutes(shift.hora_inicio);
  const end = clockMinutes(shift.hora_fin);
  if (start == null || end == null) return 0;
  return end >= start ? end - start : end + 1_440 - start;
}

function entryDelayMinutes(row: JornadaAsistenciaDetalle) {
  const scheduledStart = clockMinutes(row.turno?.hora_inicio);
  if (scheduledStart == null) return null;
  return Math.max(0, limaClockMinutes(new Date(row.entrada_at)) - scheduledStart);
}

function attendanceHours(row: JornadaAsistenciaDetalle) {
  const expected = shiftMinutes(row.turno);
  const worked = row.minutos_trabajados == null ? "En curso" : workedTime(row.minutos_trabajados);
  return expected ? `${worked} / ${workedTime(expected)}` : worked;
}

export function OwnerPage() {
  const { profile } = useAuth();
  const { branches, selectedBranchId } = useBranch();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("seccion") as OwnerTab | null;
  const tab = TAB_LABELS.some(([id]) => id === requested) ? requested as OwnerTab : "dashboard";
  const [evidence, setEvidence] = useState<EvidenceMeta | null>(null);
  const today = limaDate();
  const branchFilter = selectedBranchId === "all" ? undefined : selectedBranchId;

  const professionalsQuery = useQuery({ queryKey: ["owner-professionals"], queryFn: () => listProfessionals(false) });
  const shiftsQuery = useQuery({ queryKey: ["owner-shifts"], queryFn: () => listOwnerShifts(false) });
  const todayQuery = useQuery({
    queryKey: ["owner-attendance", "today", branchFilter, today],
    queryFn: () => listAttendance({ branchId: branchFilter, from: today, to: today, pageSize: 100 })
  });

  useEffect(() => subscribeToAttendanceChanges(() => {
    queryClient.invalidateQueries({ queryKey: ["owner-attendance"] });
  }), []);

  if (profile?.rol !== "owner") return <Navigate to="/" replace />;

  const professionals = professionalsQuery.data ?? [];
  const shifts = shiftsQuery.data ?? [];
  const todayRows = todayQuery.data?.data ?? [];
  const todayScheduled = scheduledProfessionalsForDate(shifts, today, branchFilter);
  const presentIds = new Set(todayRows.map((row) => row.profesional_id));
  const currentMinutes = limaClockMinutes();
  const absentIds = todayScheduled.filter((id) => {
    const shift = resolvedShift(shifts, id, today, branchFilter);
    const scheduledStart = clockMinutes(shift?.hora_inicio);
    return shift && scheduledStart != null && currentMinutes > scheduledStart + shift.tolerancia_minutos && !presentIds.has(id);
  });
  const lateRows = todayRows.filter((row) => row.estado_entrada === "tardanza");
  const pendingExitRows = todayRows.filter((row) => {
    if (row.salida_at || !row.turno) return false;
    const scheduledEnd = clockMinutes(row.turno.hora_fin);
    return scheduledEnd != null && currentMinutes > scheduledEnd;
  });
  const scheduledEntries = todayRows.filter((row) => row.turno && row.estado_entrada !== "sin_turno");
  const onTimeEntries = scheduledEntries.filter((row) => row.estado_entrada === "a_tiempo");
  const expectedMinutes = todayScheduled.reduce((sum, id) => sum + shiftMinutes(resolvedShift(shifts, id, today, branchFilter)), 0);
  const workedMinutes = todayRows.reduce((sum, row) => sum + Number(row.minutos_trabajados ?? 0), 0);
  const lateMinutes = lateRows.reduce((sum, row) => sum + Number(entryDelayMinutes(row) ?? 0), 0);
  const dashboardMetrics = {
    scheduled: todayScheduled.length,
    present: presentIds.size,
    working: todayRows.filter((row) => !row.salida_at).length,
    late: lateRows.length,
    lateMinutes,
    absences: absentIds.length,
    pendingExit: pendingExitRows.length,
    punctuality: scheduledEntries.length ? Math.round((onTimeEntries.length / scheduledEntries.length) * 100) : null,
    expectedMinutes,
    workedMinutes
  };
  const professionalMap = new Map(professionals.map((professional) => [professional.id, fullName(professional)]));

  return (
    <main className="page owner-page">
      <PageHeader
        eyebrow="Panel privado de la propietaria"
        title="Control de personal"
        description="Turnos, asistencia, evidencias y horas trabajadas con datos en tiempo real."
      />
      <div className="tabs owner-tabs" role="tablist" aria-label="Secciones de control de personal">
        {TAB_LABELS.map(([id, label]) => <button key={id} type="button" className={`tab ${tab === id ? "tab--active" : ""}`} onClick={() => setSearchParams(id === "dashboard" ? {} : { seccion: id })}>{label}</button>)}
      </div>

      {(professionalsQuery.isLoading || shiftsQuery.isLoading || todayQuery.isLoading) && ["dashboard", "hoy"].includes(tab) ? <TableSkeleton rows={7} /> : null}

      {tab === "dashboard" && !todayQuery.isLoading ? <>
        <section className="owner-metrics">
          <OwnerMetric label="Programados hoy" value={dashboardMetrics.scheduled} detail={`${dashboardMetrics.present} con entrada`} icon={<Users />} tone="blue" />
          <OwnerMetric label="Trabajando ahora" value={dashboardMetrics.working} detail="Marcacion abierta" icon={<UserCheck />} tone="teal" />
          <OwnerMetric label="Puntualidad" value={dashboardMetrics.punctuality == null ? "--" : `${dashboardMetrics.punctuality}%`} detail={`${onTimeEntries.length} entradas a tiempo`} icon={<Clock3 />} tone="teal" />
          <OwnerMetric label="Tardanzas" value={dashboardMetrics.late} detail={`${dashboardMetrics.lateMinutes} min acumulados`} icon={<Clock3 />} tone="coral" />
          <OwnerMetric label="Ausencias" value={dashboardMetrics.absences} detail="Solo turnos ya iniciados" icon={<UserX />} tone="lilac" />
          <OwnerMetric label="Salidas vencidas" value={dashboardMetrics.pendingExit} detail="Requieren revision" icon={<AlertTriangle />} tone="coral" />
          <OwnerMetric label="Horas completadas" value={workedTime(dashboardMetrics.workedMinutes)} detail="Jornadas cerradas hoy" icon={<LogOut />} tone="blue" />
          <OwnerMetric label="Horas programadas" value={workedTime(dashboardMetrics.expectedMinutes)} detail="Segun turnos vigentes" icon={<LogIn />} tone="blue" />
        </section>
        {(lateRows.length || absentIds.length || pendingExitRows.length) ? <section className="owner-attendance-alerts" aria-label="Alertas de asistencia">
          {lateRows.length ? <div><Clock3 /><span><strong>{lateRows.length} tardanza(s)</strong>{lateRows.map((row) => `${fullName(row.profesional)} (${entryDelayMinutes(row)} min)`).join(", ")}</span></div> : null}
          {absentIds.length ? <div><UserX /><span><strong>{absentIds.length} ausencia(s) por revisar</strong>{absentIds.map((id) => professionalMap.get(id) ?? "Profesional").join(", ")}</span></div> : null}
          {pendingExitRows.length ? <div><AlertTriangle /><span><strong>{pendingExitRows.length} salida(s) sin marcar</strong>{pendingExitRows.map((row) => fullName(row.profesional)).join(", ")}</span></div> : null}
        </section> : null}
        <Card title="Asistencia de hoy">
          <AttendanceTable rows={todayRows} onEvidence={setEvidence} />
        </Card>
      </> : null}

      {tab === "hoy" ? <section className="owner-section stack">
        <div className="owner-section__heading"><div><h2>Asistencia de hoy</h2><p>{today} · actualizacion en tiempo real</p></div></div>
        <AttendanceTable rows={todayRows} onEvidence={setEvidence} />
      </section> : null}

      {tab === "evidencias" ? <EvidenceGallery professionals={professionals} branchId={branchFilter} onEvidence={setEvidence} /> : null}
      {tab === "historial" ? <AttendanceHistory professionals={professionals} branchId={branchFilter} onEvidence={setEvidence} /> : null}
      {tab === "turnos" ? <OwnerShiftsPanel professionals={professionals} branches={branches.filter((branch) => branch.activo)} shifts={shifts} /> : null}
      {tab === "reportes" ? <AttendanceReports professionals={professionals} shifts={shifts} branchId={branchFilter} branches={branches} /> : null}
      {tab === "productos" ? <OwnerProductsPanel branches={branches.filter((branch) => branch.activo)} defaultBranchId={selectedBranchId} /> : null}

      {evidence ? <EvidenceModal evidence={evidence} onClose={() => setEvidence(null)} /> : null}
    </main>
  );
}

function OwnerMetric({ label, value, detail, icon, tone }: { label: string; value: number | string; detail?: string; icon: ReactNode; tone: "teal" | "blue" | "coral" | "lilac" }) {
  return <article className="owner-metric"><span className={`owner-metric__icon owner-metric__icon--${tone}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</div></article>;
}

function AttendanceTable({ rows, onEvidence }: { rows: JornadaAsistenciaDetalle[]; onEvidence: (meta: EvidenceMeta) => void }) {
  if (!rows.length) return <EmptyState title="Sin marcaciones" description="Las entradas y salidas apareceran aqui en tiempo real." />;
  return <div className="table-wrap"><table className="table owner-attendance-table">
    <thead><tr><th>Profesional</th><th>Turno</th><th>Entrada</th><th>Puntualidad</th><th>Foto entrada</th><th>Salida</th><th>Foto salida</th><th>Estado</th><th>Horas / meta</th></tr></thead>
    <tbody>{rows.map((row) => {
      const professional = fullName(row.profesional);
      return <tr key={row.id}>
        <td data-label="Profesional"><strong>{professional}</strong><div className="muted">{row.sede?.nombre}</div></td>
        <td data-label="Turno">{row.turno ? `${toReadableTime12(row.turno.hora_inicio)} - ${toReadableTime12(row.turno.hora_fin)}` : "Sin turno"}</td>
        <td data-label="Entrada">{readableTime(row.entrada_at)}</td>
        <td data-label="Puntualidad">{row.turno ? <span className={`attendance-status attendance-status--${row.estado_entrada}`}>{row.estado_entrada === "tardanza" ? `${entryDelayMinutes(row)} min tarde` : entryDelayMinutes(row) ? `Dentro de tolerancia (${entryDelayMinutes(row)} min)` : "A tiempo"}</span> : <span className="attendance-status attendance-status--sin_turno">Sin turno</span>}</td>
        <td data-label="Foto entrada"><Button type="button" aria-label={`Abrir foto de entrada de ${professional}`} onClick={() => onEvidence({ path: row.foto_entrada_path, professional, branch: row.sede?.nombre ?? "", type: "Entrada", at: row.entrada_at })}><Camera /></Button></td>
        <td data-label="Salida">{readableTime(row.salida_at)}</td>
        <td data-label="Foto salida">{row.foto_salida_path && row.salida_at ? <Button type="button" aria-label={`Abrir foto de salida de ${professional}`} onClick={() => onEvidence({ path: row.foto_salida_path!, professional, branch: row.sede?.nombre ?? "", type: "Salida", at: row.salida_at! })}><Camera /></Button> : <span className="muted">Pendiente</span>}</td>
        <td data-label="Estado"><span className={`attendance-status attendance-status--${row.estado_entrada}`}>{row.salida_at ? "Turno completado" : row.estado_entrada === "tardanza" ? "Trabajando · tardanza" : "Trabajando"}</span></td>
        <td data-label="Horas / meta">{attendanceHours(row)}</td>
      </tr>;
    })}</tbody>
  </table></div>;
}

function EvidenceModal({ evidence, onClose }: { evidence: EvidenceMeta; onClose: () => void }) {
  const urlQuery = useQuery({ queryKey: ["attendance-evidence-url", evidence.path], queryFn: () => createAttendanceSignedUrl(evidence.path) });
  return <Modal title={`${evidence.type} · ${evidence.professional}`} onClose={onClose} footer={<Button type="button" variant="primary" onClick={onClose}>Cerrar</Button>}>
    <div className="evidence-modal">
      {urlQuery.isLoading ? <div className="attendance-loading">Abriendo evidencia privada...</div> : null}
      {urlQuery.data ? <img src={urlQuery.data} alt={`${evidence.type} de ${evidence.professional}`} /> : null}
      {urlQuery.isError ? <div className="alert">No se pudo abrir la fotografia.</div> : null}
      <dl><div><dt>Profesional</dt><dd>{evidence.professional}</dd></div><div><dt>Tipo</dt><dd>{evidence.type}</dd></div><div><dt>Fecha y hora</dt><dd>{readableDateTime(evidence.at)}</dd></div><div><dt>Sede</dt><dd>{evidence.branch}</dd></div></dl>
    </div>
  </Modal>;
}

function EvidenceGallery({ professionals, branchId, onEvidence }: { professionals: Profesional[]; branchId?: string; onEvidence: (meta: EvidenceMeta) => void }) {
  const [professionalId, setProfessionalId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState<"all" | "entrada" | "salida">("all");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["owner-attendance", "evidence", branchId, professionalId, from, to, type, page],
    queryFn: () => listAttendance({ branchId, professionalId: professionalId || undefined, from: from || undefined, to: to || undefined, markType: type, page, pageSize: 12 })
  });
  const cards = (query.data?.data ?? []).flatMap((row) => {
    const professional = fullName(row.profesional);
    const result: EvidenceMeta[] = [];
    if (type !== "salida") result.push({ path: row.foto_entrada_path, professional, branch: row.sede?.nombre ?? "", type: "Entrada", at: row.entrada_at });
    if (type !== "entrada" && row.foto_salida_path && row.salida_at) result.push({ path: row.foto_salida_path, professional, branch: row.sede?.nombre ?? "", type: "Salida", at: row.salida_at });
    return result;
  });
  return <section className="owner-section stack">
    <div className="owner-section__heading"><div><h2>Galeria de evidencias</h2><p>URLs privadas con vencimiento automatico y carga paginada.</p></div></div>
    <div className="owner-filters">
      <Field label="Profesional"><Select value={professionalId} onChange={(event) => { setProfessionalId(event.target.value); setPage(1); }}><option value="">Todos</option>{professionals.map((item) => <option value={item.id} key={item.id}>{fullName(item)}</option>)}</Select></Field>
      <Field label="Desde"><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></Field>
      <Field label="Hasta"><Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></Field>
      <Field label="Marcacion"><Select value={type} onChange={(event) => { setType(event.target.value as typeof type); setPage(1); }}><option value="all">Entrada y salida</option><option value="entrada">Entrada</option><option value="salida">Salida</option></Select></Field>
    </div>
    {query.isLoading ? <TableSkeleton rows={6} /> : cards.length ? <div className="evidence-gallery">{cards.map((card) => <EvidenceCard key={`${card.path}-${card.type}`} evidence={card} onOpen={() => onEvidence(card)} />)}</div> : <EmptyState title="Sin evidencias" description="No hay fotografias para los filtros seleccionados." />}
    <Pagination page={page} count={query.data?.count ?? 0} pageSize={12} onChange={setPage} />
  </section>;
}

function EvidenceCard({ evidence, onOpen }: { evidence: EvidenceMeta; onOpen: () => void }) {
  const urlQuery = useQuery({ queryKey: ["attendance-evidence-thumb", evidence.path], queryFn: () => createAttendanceSignedUrl(evidence.path, 180), staleTime: 120_000 });
  return <button className="evidence-card" type="button" onClick={onOpen}>
    <span className="evidence-card__media">{urlQuery.data ? <img loading="lazy" src={urlQuery.data} alt="" /> : <Image />}</span>
    <span className="evidence-card__body"><strong>{evidence.professional}</strong><span>{evidence.type} · {readableDateTime(evidence.at)}</span><small>{evidence.branch}</small></span>
  </button>;
}

function AttendanceHistory({ professionals, branchId, onEvidence }: { professionals: Profesional[]; branchId?: string; onEvidence: (meta: EvidenceMeta) => void }) {
  const [professionalId, setProfessionalId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["owner-attendance", "history", branchId, professionalId, from, to, page], queryFn: () => listAttendance({ branchId, professionalId: professionalId || undefined, from: from || undefined, to: to || undefined, page, pageSize: 25 }) });
  return <section className="owner-section stack">
    <div className="owner-section__heading"><div><h2>Historial de asistencia</h2><p>Busca por profesional, periodo y sede seleccionada.</p></div></div>
    <div className="owner-filters"><Field label="Profesional"><Select value={professionalId} onChange={(event) => { setProfessionalId(event.target.value); setPage(1); }}><option value="">Todos</option>{professionals.map((item) => <option value={item.id} key={item.id}>{fullName(item)}</option>)}</Select></Field><Field label="Desde"><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></Field><Field label="Hasta"><Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></Field></div>
    {query.isLoading ? <TableSkeleton /> : <AttendanceTable rows={query.data?.data ?? []} onEvidence={onEvidence} />}
    <Pagination page={page} count={query.data?.count ?? 0} pageSize={25} onChange={setPage} />
  </section>;
}

function Pagination({ page, count, pageSize, onChange }: { page: number; count: number; pageSize: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return <div className="pagination"><span>{count} registros</span><Button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Anterior</Button><span>{page} / {pages}</span><Button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Siguiente</Button></div>;
}

function AttendanceReports({ professionals, shifts, branchId, branches }: { professionals: Profesional[]; shifts: TurnoProfesionalDetalle[]; branchId?: string; branches: Array<{ id: string; nombre: string }> }) {
  const [month, setMonth] = useState(limaDate().slice(0, 7));
  const [professionalId, setProfessionalId] = useState("");
  const range = monthRange(month);
  const query = useQuery({ queryKey: ["owner-attendance", "report", branchId, professionalId, month], queryFn: () => listAttendanceForReport({ branchId, professionalId: professionalId || undefined, from: range.from, to: range.to }) });
  const report = useMemo(() => buildMonthlyReport(professionals, shifts, query.data ?? [], month, branchId, professionalId), [branchId, month, professionalId, professionals, query.data, shifts]);
  const branchName = branchId ? branches.find((branch) => branch.id === branchId)?.nombre ?? "Sede" : "Todas las sedes";
  return <section className="owner-section stack">
    <div className="owner-section__heading"><div><h2>Reporte mensual</h2><p>Resumen calculado desde turnos y marcaciones originales.</p></div><Button type="button" disabled={!report.length} onClick={() => downloadReportCsv(report, month, branchName)}><Download /> Descargar CSV</Button></div>
    <div className="owner-filters"><Field label="Mes"><Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></Field><Field label="Profesional"><Select value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}><option value="">Todos</option>{professionals.map((item) => <option value={item.id} key={item.id}>{fullName(item)}</option>)}</Select></Field><div className="owner-report-scope"><BriefcaseBusiness /><span>Sede</span><strong>{branchName}</strong></div></div>
    {query.isLoading ? <TableSkeleton /> : report.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Profesional</th><th>Dias programados</th><th>Dias trabajados</th><th>Ausencias</th><th>Puntualidad</th><th>Tardanzas</th><th>Min. tarde</th><th>Horas trabajadas</th><th>Horas programadas</th><th>Promedio entrada</th><th>Incompletas</th></tr></thead><tbody>{report.map((row) => <tr key={row.professionalId}><td data-label="Profesional"><strong>{row.professional}</strong></td><td data-label="Dias programados">{row.scheduledDays}</td><td data-label="Dias trabajados">{row.workedDays}</td><td data-label="Ausencias">{row.absences}</td><td data-label="Puntualidad">{row.punctuality == null ? "--" : `${row.punctuality}%`}</td><td data-label="Tardanzas">{row.late}</td><td data-label="Min. tarde">{row.lateMinutes}</td><td data-label="Horas trabajadas">{workedTime(row.totalMinutes)}</td><td data-label="Horas programadas">{workedTime(row.expectedMinutes)}</td><td data-label="Promedio entrada">{row.averageEntry}</td><td data-label="Incompletas">{row.incomplete}</td></tr>)}</tbody></table></div> : <EmptyState title="Sin datos para el periodo" />}
  </section>;
}

type ReportRow = { professionalId: string; professional: string; scheduledDays: number; workedDays: number; absences: number; punctuality: number | null; late: number; lateMinutes: number; totalMinutes: number; expectedMinutes: number; averageEntry: string; incomplete: number };

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function isoWeekday(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function monthDates(month: string) {
  const { from, to } = monthRange(month);
  const result: string[] = [];
  let current = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (current <= end) {
    result.push(current.toISOString().slice(0, 10));
    current = new Date(current.getTime() + 86_400_000);
  }
  return result;
}

function resolvedShift(shifts: TurnoProfesionalDetalle[], professionalId: string, date: string, branchId?: string) {
  return shifts.filter((shift) => shift.profesional_id === professionalId && (!branchId || shift.sede_id === branchId) && shift.dia_semana === isoWeekday(date) && shift.vigente_desde <= date && (!shift.vigente_hasta || shift.vigente_hasta >= date)).sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde) || b.created_at.localeCompare(a.created_at))[0];
}

function scheduledProfessionalsForDate(shifts: TurnoProfesionalDetalle[], date: string, branchId?: string) {
  const ids = new Set(shifts.map((shift) => shift.profesional_id));
  return [...ids].filter((id) => {
    const shift = resolvedShift(shifts, id, date, branchId);
    return shift && !shift.es_descanso;
  });
}

function buildMonthlyReport(professionals: Profesional[], shifts: TurnoProfesionalDetalle[], attendance: JornadaAsistenciaDetalle[], month: string, branchId?: string, onlyProfessional?: string): ReportRow[] {
  const dates = monthDates(month).filter((date) => date <= limaDate());
  return professionals.filter((professional) => !onlyProfessional || professional.id === onlyProfessional).map((professional) => {
    const rows = attendance.filter((row) => row.profesional_id === professional.id);
    const scheduledDates = dates.filter((date) => {
      const shift = resolvedShift(shifts, professional.id, date, branchId);
      return shift && !shift.es_descanso;
    });
    const workedDates = new Set(rows.map((row) => row.fecha_local));
    const scheduledRows = rows.filter((row) => row.turno && row.estado_entrada !== "sin_turno");
    const punctualRows = scheduledRows.filter((row) => row.estado_entrada === "a_tiempo");
    const entryMinutes = rows.map((row) => {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(row.entrada_at)).split(":").map(Number);
      return parts[0] * 60 + parts[1];
    });
    const average = entryMinutes.length ? Math.round(entryMinutes.reduce((sum, value) => sum + value, 0) / entryMinutes.length) : null;
    return {
      professionalId: professional.id,
      professional: fullName(professional),
      scheduledDays: scheduledDates.length,
      workedDays: workedDates.size,
      absences: scheduledDates.filter((date) => !workedDates.has(date)).length,
      punctuality: scheduledRows.length ? Math.round((punctualRows.length / scheduledRows.length) * 100) : null,
      late: rows.filter((row) => row.estado_entrada === "tardanza").length,
      lateMinutes: rows.filter((row) => row.estado_entrada === "tardanza").reduce((sum, row) => sum + Number(entryDelayMinutes(row) ?? 0), 0),
      totalMinutes: rows.reduce((sum, row) => sum + Number(row.minutos_trabajados ?? 0), 0),
      expectedMinutes: scheduledDates.reduce((sum, date) => sum + shiftMinutes(resolvedShift(shifts, professional.id, date, branchId)), 0),
      averageEntry: average == null ? "--" : toReadableTime12(`${String(Math.floor(average / 60)).padStart(2, "0")}:${String(average % 60).padStart(2, "0")}`),
      incomplete: rows.filter((row) => !row.salida_at).length
    };
  });
}

function downloadReportCsv(rows: ReportRow[], month: string, branch: string) {
  const header = ["Profesional", "Dias programados", "Dias trabajados", "Ausencias", "Puntualidad %", "Tardanzas", "Minutos tarde", "Minutos trabajados", "Minutos programados", "Promedio entrada", "Marcaciones incompletas"];
  const csv = [header, ...rows.map((row) => [row.professional, row.scheduledDays, row.workedDays, row.absences, row.punctuality ?? "", row.late, row.lateMinutes, row.totalMinutes, row.expectedMinutes, row.averageEntry, row.incomplete])]
    .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `asistencia-${branch.toLowerCase().replace(/\s+/g, "-")}-${month}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
