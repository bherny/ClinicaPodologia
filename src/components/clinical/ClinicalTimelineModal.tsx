import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, ClipboardPlus, Image, Trash2 } from "lucide-react";
import { toReadableDate, toReadableDateTime } from "../../lib/date";
import { queryClient } from "../../lib/queryClient";
import { listClinicalTimeline, softDeleteClinicalPhoto, softDeletePhysiotherapySession } from "../../services/clinicalTimeline";
import type { FotoHistoriaClinica, HistoriaClinicaDetalle, SesionFisioterapia } from "../../types/domain";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";
import { TableSkeleton } from "../ui/Skeleton";
import { ClinicalPhotoModal } from "./ClinicalPhotoModal";
import { PhysiotherapySessionModal } from "./PhysiotherapySessionModal";

const STAGE_LABELS = { antes: "Antes", despues: "Después", seguimiento: "Seguimiento", otra: "Otra" } as const;
const SESSION_LABELS: Record<string, string> = { mejoro: "Mejoró", igual: "Igual", empeoro: "Empeoró" };

export function ClinicalTimelineModal({ history, onClose }: { history: HistoriaClinicaDetalle; onClose: () => void }) {
  const [addingSession, setAddingSession] = useState(false);
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({ queryKey: ["clinical-timeline", history.id], queryFn: () => listClinicalTimeline(history.id) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["clinical-timeline", history.id] });
  const deleteSession = useMutation({ mutationFn: softDeletePhysiotherapySession, onSuccess: refresh, onError: (cause) => setError(cause instanceof Error ? cause.message : "No se pudo eliminar la sesión.") });
  const deletePhoto = useMutation({ mutationFn: softDeleteClinicalPhoto, onSuccess: refresh, onError: (cause) => setError(cause instanceof Error ? cause.message : "No se pudo eliminar la fotografía.") });

  const confirmDeleteSession = (session: SesionFisioterapia) => {
    if (window.confirm(`¿Eliminar la sesión ${session.numero_sesion}? La acción quedará auditada.`)) deleteSession.mutate(session.id);
  };
  const confirmDeletePhoto = (photo: FotoHistoriaClinica) => {
    if (window.confirm("¿Eliminar esta fotografía clínica?")) deletePhoto.mutate(photo);
  };

  return (
    <>
      <Modal title="Evolución y fotografías" size="wide" onClose={onClose} footer={<Button type="button" onClick={onClose}>Cerrar</Button>}>
        <div className="clinical-timeline-toolbar">
          <div><strong>Historial cronológico del paciente</strong><span>Sesiones, evolución y evidencia fotográfica privada.</span></div>
          <div className="inline"><Button type="button" onClick={() => setAddingPhoto(true)}><Camera /> Agregar foto</Button><Button type="button" variant="primary" onClick={() => setAddingSession(true)}><ClipboardPlus /> Nueva sesión</Button></div>
        </div>
        {error || query.error ? <div className="alert alert--warning">{error || (query.error instanceof Error ? query.error.message : "No se pudo cargar el historial.")}</div> : null}
        {query.isLoading ? <TableSkeleton rows={5} /> : null}

        {!query.isLoading && !(query.data?.sessions.length || query.data?.photos.length) ? <EmptyState title="Aún no hay sesiones ni fotografías" description="Registra una sesión rápida o una foto de seguimiento cuando sea necesario." /> : null}

        {query.data?.sessions.length ? <section className="clinical-timeline-section"><h3>Sesiones de fisioterapia</h3><div className="clinical-session-list">{query.data.sessions.map((session) => <article className="clinical-session-card" key={session.id}>
          <header><div><span>Sesión {session.numero_sesion}</span><strong>{toReadableDate(session.fecha)}</strong></div><Button type="button" variant="danger" title="Eliminar sesión" aria-label={`Eliminar sesión ${session.numero_sesion}`} onClick={() => confirmDeleteSession(session)}><Trash2 /></Button></header>
          <div className="clinical-session-card__grid"><TimelineDatum label="Motivo / zona" value={session.motivo_zona} /><TimelineDatum label="Diagnóstico" value={session.diagnostico_medico} /><TimelineDatum label="EVA" value={session.eva_inicial === null && session.eva_final === null ? "" : `${session.eva_inicial ?? "-"} → ${session.eva_final ?? "-"} / 10`} /><TimelineDatum label="Evolución" value={SESSION_LABELS[session.evolucion] ?? ""} /><TimelineDatum label="Hallazgos" value={session.hallazgos} /><TimelineDatum label="Tratamientos" value={[...session.tratamientos, session.otro_tratamiento].filter(Boolean).join(", ")} /><TimelineDatum label="Respuesta" value={session.respuesta_paciente} /><TimelineDatum label="Indicaciones" value={session.indicaciones_proxima_sesion} /></div>
          {session.tecnico_nombre ? <footer>Técnico: {session.tecnico_nombre}{session.firma_trazos.length ? " · Firma registrada" : ""}</footer> : null}
        </article>)}</div></section> : null}

        {query.data?.photos.length ? <section className="clinical-timeline-section"><h3>Registro fotográfico</h3><div className="clinical-photo-grid">{query.data.photos.map((photo) => <figure className="clinical-photo-card" key={photo.id}>
          <a href={photo.signed_url} target="_blank" rel="noreferrer">{photo.signed_url ? <img src={photo.signed_url} alt={`${STAGE_LABELS[photo.etapa]} - ${toReadableDateTime(photo.fecha_toma)}`} loading="lazy" /> : <div className="clinical-photo-card__missing"><Image /></div>}</a>
          <figcaption><div><span className={`badge clinical-photo-stage clinical-photo-stage--${photo.etapa}`}>{STAGE_LABELS[photo.etapa]}</span><strong>{toReadableDateTime(photo.fecha_toma)}</strong></div>{photo.nota ? <p>{photo.nota}</p> : null}<Button type="button" variant="danger" title="Eliminar fotografía" onClick={() => confirmDeletePhoto(photo)}><Trash2 /></Button></figcaption>
        </figure>)}</div></section> : null}
      </Modal>
      {addingSession ? <PhysiotherapySessionModal history={history} onClose={() => setAddingSession(false)} /> : null}
      {addingPhoto ? <ClinicalPhotoModal history={history} onClose={() => setAddingPhoto(false)} /> : null}
    </>
  );
}

function TimelineDatum({ label, value }: { label: string; value?: string | null }) {
  return <div><span>{label}</span><strong>{value?.trim() || "No registrado"}</strong></div>;
}
