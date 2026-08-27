import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Edit, Eye, FileText, MessageCircle, PenLine, Plus, Trash2 } from "lucide-react";
import { ClinicalHistoryEvaluationView } from "../components/clinical/ClinicalHistoryEvaluationView";
import { ClinicalHistoryFormModal } from "../components/clinical/ClinicalHistoryFormModal";
import { DocumentSignatureModal } from "../components/documents/DocumentSignatureModal";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/PageHeader";
import { TableSkeleton } from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { useBranch } from "../context/BranchContext";
import { downloadClinicalHistoryPdf } from "../lib/clinicalHistoryPdf";
import { fullName } from "../lib/format";
import { toReadableDate } from "../lib/date";
import { queryClient } from "../lib/queryClient";
import { buildClinicalHistoryShareMessage, buildWhatsAppUrl, hasValidWhatsAppPhone } from "../lib/whatsapp";
import {
  listClinicalHistory,
  normalizeClinicalEvaluation,
  recordClinicalHistoryDocumentAction,
  softDeleteClinicalHistory
} from "../services/history";
import type { HistoriaClinicaDetalle } from "../types/domain";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function clinicalValue(value?: string | null) {
  const normalized = value?.trim() ?? "";
  if (/^pendiente de (registrar|atencion)$/i.test(normalized)) return "";
  return normalized;
}

function clinicalHypothesis(history: HistoriaClinicaDetalle) {
  const evaluation = normalizeClinicalEvaluation(history.evaluacion);
  return evaluation.hipotesis_diagnostico.find(Boolean) || clinicalValue(history.diagnostico) || "Pendiente de completar";
}

function clinicalPlan(history: HistoriaClinicaDetalle) {
  const evaluation = normalizeClinicalEvaluation(history.evaluacion);
  return evaluation.trabajo_casa || clinicalValue(history.tratamiento_realizado) || "Pendiente de completar";
}

export function ClinicalHistoryPage() {
  const { selectedBranchId } = useBranch();
  const { profile } = useAuth();
  const [editing, setEditing] = useState<HistoriaClinicaDetalle | "new" | null>(null);
  const [viewing, setViewing] = useState<HistoriaClinicaDetalle | null>(null);
  const [sharing, setSharing] = useState<HistoriaClinicaDetalle | null>(null);
  const [signing, setSigning] = useState<HistoriaClinicaDetalle | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [documentBusyId, setDocumentBusyId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ["clinical-history", selectedBranchId],
    queryFn: () => listClinicalHistory(selectedBranchId),
    enabled: profile?.rol !== "recepcion"
  });

  const deleteMutation = useMutation({
    mutationFn: softDeleteClinicalHistory,
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["clinical-history"] });
      queryClient.invalidateQueries({ queryKey: ["patient-history"] });
    },
    onError: (nextError) => {
      setActionError(getErrorMessage(nextError, "No se pudo eliminar la historia clinica"));
    }
  });

  const handleDownload = async (history: HistoriaClinicaDetalle) => {
    setActionError(null);
    setActionMessage(null);
    setDocumentBusyId(history.id);
    try {
      const fileName = await downloadClinicalHistoryPdf(history);
      try {
        await recordClinicalHistoryDocumentAction(history.id, "descarga_pdf", { file_name: fileName });
        setActionMessage("PDF descargado y registrado en auditoria.");
      } catch (auditError) {
        setActionError(`El PDF se descargo correctamente, pero no se registro en auditoria. ${getErrorMessage(auditError, "")}`);
      }
    } catch (error) {
      setActionError(getErrorMessage(error, "No se pudo generar el PDF de la historia clinica."));
    } finally {
      setDocumentBusyId(null);
    }
  };

  if (profile?.rol === "recepcion") {
    return (
      <main className="page">
        <div className="alert">Tu rol no tiene acceso a informacion clinica privada.</div>
      </main>
    );
  }

  const rows = historyQuery.data ?? [];

  return (
    <main className="page">
      <PageHeader
        eyebrow="Historias clinicas"
        title="Registro clinico historico"
        description="Consulta, completa y comparte documentos clinicos sin sobrescribir atenciones anteriores."
        action={
          <Button type="button" variant="primary" onClick={() => setEditing("new")}>
            <Plus />
            Nueva historia
          </Button>
        }
      />

      {actionError ? <div className="alert" style={{ marginBottom: 14 }}>{actionError}</div> : null}
      {actionMessage ? <div className="alert alert--info" style={{ marginBottom: 14 }}>{actionMessage}</div> : null}
      {historyQuery.isError ? (
        <div className="alert" style={{ marginBottom: 14 }}>No pudimos cargar las historias clinicas. Intentalo nuevamente.</div>
      ) : null}

      <Card>
        {historyQuery.isLoading ? (
          <TableSkeleton />
        ) : rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Paciente</th>
                  <th>Hipótesis diagnóstica</th>
                  <th>Trabajo para casa</th>
                  <th>Profesional</th>
                  <th>Sede</th>
                  <th>Proxima fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Fecha">{toReadableDate(item.fecha_evaluacion ?? item.cita?.fecha ?? item.created_at.slice(0, 10))}</td>
                    <td data-label="Paciente">
                      <strong>{fullName(item.paciente)}</strong>
                      <div className="muted">{item.paciente?.telefono}</div>
                    </td>
                    <td data-label="Diagnostico">{clinicalHypothesis(item)}</td>
                    <td data-label="Tratamiento">{clinicalPlan(item)}</td>
                    <td data-label="Profesional">{fullName(item.profesional)}</td>
                    <td data-label="Sede">{item.sede?.nombre}</td>
                    <td data-label="Proxima fecha">{item.proxima_fecha_sugerida ? toReadableDate(item.proxima_fecha_sugerida) : "Sin sugerencia"}</td>
                    <td data-label="Acciones">
                      <div className="clinical-actions">
                        <Button type="button" aria-label="Ver historia clinica" title="Ver detalle" onClick={() => setViewing(item)}>
                          <Eye />
                        </Button>
                        <Button type="button" aria-label="Editar historia clinica" title="Editar" onClick={() => setEditing(item)}>
                          <Edit />
                        </Button>
                        <Button
                          type="button"
                          aria-label="Descargar historia clinica en PDF"
                          title="Descargar PDF"
                          disabled={documentBusyId === item.id}
                          onClick={() => handleDownload(item)}
                        >
                          <Download />
                        </Button>
                        <Button type="button" aria-label="Firmar historia clinica" title="Firmas" onClick={() => setSigning(item)}>
                          <PenLine />
                        </Button>
                        <Button
                          type="button"
                          variant="whatsapp"
                          aria-label="Enviar historia clinica por WhatsApp"
                          title="Preparar para WhatsApp"
                          onClick={() => setSharing(item)}
                        >
                          <MessageCircle />
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          aria-label="Eliminar historia clinica"
                          title="Eliminar"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (confirm("¿Eliminar logicamente esta historia clinica?")) deleteMutation.mutate(item.id);
                          }}
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
          <EmptyState title="Aun no hay historias clinicas" />
        )}
      </Card>

      {editing ? (
        <ClinicalHistoryFormModal
          history={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {viewing ? (
        <ClinicalHistoryDetailModal
          history={viewing}
          onEdit={() => {
            setViewing(null);
            setEditing(viewing);
          }}
          onDownload={() => handleDownload(viewing)}
          onShare={() => {
            setViewing(null);
            setSharing(viewing);
          }}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {sharing ? <ClinicalHistoryShareModal history={sharing} onClose={() => setSharing(null)} /> : null}
      {signing ? <DocumentSignatureModal documentType="historia_clinica" documentId={signing.id} patientName={fullName(signing.paciente)} onClose={() => setSigning(null)} /> : null}
    </main>
  );
}

function ClinicalHistoryDetailModal({
  history,
  onEdit,
  onDownload,
  onShare,
  onClose
}: {
  history: HistoriaClinicaDetalle;
  onEdit: () => void;
  onDownload: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      size="wide"
      title="Detalle de historia clínica"
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>Cerrar</Button>
          <Button type="button" onClick={onEdit}><Edit /> Editar</Button>
          <Button type="button" onClick={onDownload}><Download /> Descargar PDF</Button>
          <Button type="button" variant="whatsapp" onClick={onShare}><MessageCircle /> WhatsApp</Button>
        </>
      }
    >
      <ClinicalHistoryEvaluationView history={history} />
    </Modal>
  );
}

function ClinicalHistoryShareModal({
  history,
  onClose
}: {
  history: HistoriaClinicaDetalle;
  onClose: () => void;
}) {
  const patientName = fullName(history.paciente);
  const phone = history.paciente?.telefono ?? "";
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canOpenWhatsApp = hasValidWhatsAppPhone(phone);

  const continueToWhatsApp = async () => {
    setBusy(true);
    setError(null);
    const whatsappWindow = window.open("", "_blank");
    if (whatsappWindow) whatsappWindow.opener = null;

    try {
      const fileName = await downloadClinicalHistoryPdf(history);
      const message = buildClinicalHistoryShareMessage(patientName);
      try {
        await recordClinicalHistoryDocumentAction(history.id, "intento_compartir_whatsapp", {
          file_name: fileName,
          phone_last_digits: phone.replace(/\D/g, "").slice(-4)
        });
      } catch (auditError) {
        setError(`WhatsApp se preparo, pero la auditoria no pudo registrarse. ${getErrorMessage(auditError, "")}`);
      }

      if (!whatsappWindow) {
        throw new Error("El navegador bloqueo la nueva ventana. Permite ventanas emergentes e intentalo nuevamente.");
      }
      whatsappWindow.location.href = buildWhatsAppUrl(phone, message);
      setCompleted(true);
    } catch (nextError) {
      whatsappWindow?.close();
      setError(getErrorMessage(nextError, "No se pudo preparar el documento para WhatsApp."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Enviar historia clinica"
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>{completed ? "Cerrar" : "Cancelar"}</Button>
          {!completed ? (
            <Button type="button" variant="whatsapp" disabled={busy || !canOpenWhatsApp} onClick={continueToWhatsApp}>
              <MessageCircle />
              {busy ? "Preparando..." : "Continuar a WhatsApp"}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="stack">
        <section className="share-document-summary">
          <FileText />
          <div><span>Paciente</span><strong>{patientName}</strong></div>
          <div><span>Telefono</span><strong>{phone || "No registrado"}</strong></div>
          <div><span>Documento</span><strong>Historia clinica</strong></div>
        </section>
        {!canOpenWhatsApp ? (
          <div className="alert">El paciente no tiene un numero celular peruano valido para WhatsApp.</div>
        ) : null}
        {error ? <div className="alert">{error}</div> : null}
        {completed ? (
          <div className="alert alert--info">
            WhatsApp se abrio con el mensaje preparado. El PDF ya fue descargado: debes adjuntarlo manualmente antes de enviar.
          </div>
        ) : (
          <div className="alert alert--info">
            WhatsApp Web no permite adjuntar el PDF automaticamente. El sistema lo descargara y abrira la conversacion correcta para que lo adjuntes manualmente.
          </div>
        )}
      </div>
    </Modal>
  );
}
