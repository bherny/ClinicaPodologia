import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Download,
  FileHeart,
  FileText,
  LogOut,
  MapPin,
  Phone,
  ShieldCheck,
  Stethoscope,
  UserRound
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { TableSkeleton } from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { toReadableDate, toReadableDateLong, todayISO } from "../lib/date";
import { downloadClinicalHistoryPdf } from "../lib/clinicalHistoryPdf";
import { fullName } from "../lib/format";
import {
  clearPatientPortalSession,
  getMyPatientPortal,
  recordPatientHistoryDownload
} from "../services/patientPortal";
import type { HistoriaClinicaDetalle } from "../types/domain";

function clinicalValue(value?: string | null) {
  const text = value?.trim() ?? "";
  return text && !/^pendiente de (registrar|atencion)$/i.test(text) ? text : "Pendiente de registrar";
}

function historyDate(history: HistoriaClinicaDetalle) {
  return history.cita?.fecha ?? history.created_at.slice(0, 10);
}

export function PatientPortalPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const portalQuery = useQuery({
    queryKey: ["patient-portal"],
    queryFn: getMyPatientPortal,
    staleTime: 30_000
  });

  const linkedData = portalQuery.data?.linked ? portalQuery.data : null;
  const nextSuggestedDate = useMemo(() => {
    if (!linkedData) return null;
    return linkedData.histories
      .map((history) => history.proxima_fecha_sugerida)
      .filter((date): date is string => Boolean(date && date >= todayISO()))
      .sort()[0] ?? null;
  }, [linkedData]);

  const handleDownload = async (history: HistoriaClinicaDetalle) => {
    setDownloadingId(history.id);
    setNotice(null);
    setWarning(null);
    try {
      const fileName = await downloadClinicalHistoryPdf(history);
      try {
        await recordPatientHistoryDownload(history.id, fileName);
        setNotice("Tu historia clinica se descargo correctamente.");
      } catch {
        setWarning("El archivo se descargo, pero no se pudo registrar la auditoria de la descarga.");
      }
    } catch (error) {
      setWarning(error instanceof Error ? error.message : "No se pudo descargar la historia clinica.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSignOut = async () => {
    clearPatientPortalSession();
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <main className="patient-portal">
      <header className="patient-portal__header">
        <div className="patient-portal__header-inner">
          <img src="/logo-body-feet.png" alt="Body Feet" />
          <div className="patient-portal__session">
            <div>
              <span>Portal del paciente</span>
              <strong>Acceso protegido</strong>
            </div>
            <Button type="button" variant="ghost" onClick={() => void handleSignOut()}>
              <LogOut />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <section className="patient-portal__main">
        {portalQuery.isLoading ? (
          <div className="patient-portal__loading">
            <TableSkeleton rows={7} />
          </div>
        ) : portalQuery.error ? (
          <div className="alert" role="alert">
            {portalQuery.error instanceof Error ? portalQuery.error.message : "No se pudo cargar tu historial clinico."}
          </div>
        ) : portalQuery.data && !portalQuery.data.linked ? (
          <section className="patient-link-state">
            <ShieldCheck />
            <p className="eyebrow">Acceso protegido</p>
            <h1>No pudimos vincular tu ficha</h1>
            <p>
              No encontramos una ficha activa para esta sesion. Solicita a recepcion que verifique tu telefono y
              vuelva a configurar tu PIN.
            </p>
            <Button type="button" variant="primary" onClick={() => void handleSignOut()}>
              <Phone />
              Volver al ingreso
            </Button>
          </section>
        ) : linkedData ? (
          <>
            <div className="patient-portal__welcome">
              <div>
                <p className="eyebrow">Mi salud Body Feet</p>
                <h1>Hola, {linkedData.patient.nombres}</h1>
                <p>Consulta y descarga tus atenciones clinicas registradas por Body Feet.</p>
              </div>
              <div className="patient-portal__verified">
                <ShieldCheck />
                Acceso verificado con PIN privado
              </div>
            </div>

            {notice ? <div className="alert alert--success" role="status">{notice}</div> : null}
            {warning ? <div className="alert" role="alert">{warning}</div> : null}

            <section className="patient-summary" aria-label="Resumen del paciente">
              <article>
                <div className="patient-summary__icon"><UserRound /></div>
                <div>
                  <span>Paciente</span>
                  <strong>{fullName(linkedData.patient)}</strong>
                  <small>DNI {linkedData.patient.dni || "no registrado"}</small>
                </div>
              </article>
              <article>
                <div className="patient-summary__icon"><FileHeart /></div>
                <div>
                  <span>Atenciones registradas</span>
                  <strong>{linkedData.histories.length}</strong>
                  <small>Historias clinicas disponibles</small>
                </div>
              </article>
              <article>
                <div className="patient-summary__icon"><CalendarDays /></div>
                <div>
                  <span>Ultima atencion</span>
                  <strong>
                    {linkedData.histories[0]
                      ? toReadableDate(historyDate(linkedData.histories[0]))
                      : "Sin atenciones"}
                  </strong>
                  <small>
                    {nextSuggestedDate
                      ? `Proxima sugerida: ${toReadableDate(nextSuggestedDate)}`
                      : "Sin proxima fecha sugerida"}
                  </small>
                </div>
              </article>
            </section>

            <section className="patient-history-section">
              <div className="patient-history-section__heading">
                <div>
                  <p className="eyebrow">Documentos clinicos</p>
                  <h2>Mi historial clinico</h2>
                </div>
                <span>{linkedData.histories.length} registros</span>
              </div>

              {linkedData.histories.length === 0 ? (
                <EmptyState
                  title="Aun no tienes historias clinicas registradas"
                  description="Tus atenciones apareceran aqui cuando el profesional complete el registro clinico."
                />
              ) : (
                <div className="patient-history-list">
                  {linkedData.histories.map((history) => (
                    <article className="patient-history-card" key={history.id}>
                      <header className="patient-history-card__header">
                        <div className="patient-history-card__date">
                          <CalendarDays />
                          <div>
                            <span>Fecha de atencion</span>
                            <strong>{toReadableDateLong(historyDate(history))}</strong>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="primary"
                          disabled={downloadingId === history.id}
                          onClick={() => void handleDownload(history)}
                        >
                          <Download />
                          {downloadingId === history.id ? "Preparando..." : "Descargar PDF"}
                        </Button>
                      </header>

                      <div className="patient-history-card__meta">
                        <span><Stethoscope /> {history.cita?.servicio?.nombre ?? "Servicio no registrado"}</span>
                        <span><UserRound /> {fullName(history.profesional)}</span>
                        <span><MapPin /> {history.sede?.nombre ?? "Sede no registrada"}</span>
                      </div>

                      <div className="patient-history-card__details">
                        <section>
                          <h3>Diagnostico</h3>
                          <p>{clinicalValue(history.diagnostico || history.cita?.diagnostico)}</p>
                        </section>
                        <section>
                          <h3>Tratamiento realizado</h3>
                          <p>{clinicalValue(history.tratamiento_realizado || history.cita?.tratamiento)}</p>
                        </section>
                        <section>
                          <h3>Evolucion</h3>
                          <p>{clinicalValue(history.evolucion)}</p>
                        </section>
                        <section>
                          <h3>Recomendaciones</h3>
                          <p>{clinicalValue(history.recomendaciones)}</p>
                        </section>
                      </div>

                      {history.proxima_fecha_sugerida ? (
                        <footer>
                          <FileText />
                          Proxima fecha sugerida: {toReadableDateLong(history.proxima_fecha_sugerida)}
                        </footer>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <p className="patient-portal__privacy">
              <ShieldCheck />
              Esta informacion es confidencial. Cierra la sesion si usas un equipo compartido.
            </p>
          </>
        ) : null}
      </section>
    </main>
  );
}
