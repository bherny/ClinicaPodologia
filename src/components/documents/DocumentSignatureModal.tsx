import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, PenLine, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { toReadableDateLong } from "../../lib/date";
import { drawSignature } from "../../lib/signature";
import { queryClient } from "../../lib/queryClient";
import { deleteDocumentSignature, listDocumentSignatures, saveDocumentSignature, type DocumentSignature, type DocumentType, type SignatureStroke, type SignerType } from "../../services/signatures";
import { Button } from "../ui/Button";
import { Field, Input, Select } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { TableSkeleton } from "../ui/Skeleton";
import { SignaturePad } from "./SignaturePad";

const SIGNER_LABELS: Record<SignerType, string> = { paciente: "Paciente", profesional: "Profesional", responsable: "Responsable" };
function SignaturePreview({ signature }: { signature: DocumentSignature }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawSignature(ref.current, signature.trazos, { width: 240, height: 84, background: "#ffffff" }); }, [signature.trazos]);
  return <canvas ref={ref} className="signature-preview" aria-label={"Firma de " + signature.firmante_nombre} />;
}

export function DocumentSignatureModal({ documentType, documentId, patientName, onClose }: { documentType: DocumentType; documentId: string; patientName: string; onClose: () => void }) {
  const { profile } = useAuth();
  const professionalName = useMemo(() => [profile?.nombres, profile?.apellidos].filter(Boolean).join(" "), [profile?.apellidos, profile?.nombres]);
  const [signerType, setSignerType] = useState<SignerType>("paciente");
  const [signerName, setSignerName] = useState(patientName);
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [error, setError] = useState<string | null>(null);
  const signaturesQuery = useQuery({ queryKey: ["document-signatures", documentType, documentId], queryFn: () => listDocumentSignatures(documentType, documentId) });

  useEffect(() => {
    setSignerName(signerType === "paciente" ? patientName : signerType === "profesional" ? professionalName : "");
    setStrokes([]);
  }, [patientName, professionalName, signerType]);

  const saveMutation = useMutation({
    mutationFn: () => saveDocumentSignature({ documentType, documentId, signerType, signerName, strokes }),
    onSuccess: () => { setError(null); setStrokes([]); queryClient.invalidateQueries({ queryKey: ["document-signatures", documentType, documentId] }); },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo guardar la firma.")
  });
  const deleteMutation = useMutation({
    mutationFn: deleteDocumentSignature,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document-signatures", documentType, documentId] }),
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo eliminar la firma.")
  });

  return <Modal title="Firmas del documento" size="wide" onClose={onClose} footer={<>
    <Button type="button" onClick={onClose}>Cerrar</Button>
    <Button type="button" variant="primary" disabled={saveMutation.isPending || signerName.trim().length < 2 || !strokes.length} onClick={() => saveMutation.mutate()}>
      <PenLine />{saveMutation.isPending ? "Guardando..." : "Guardar firma"}
    </Button>
  </>}>
    <div className="signature-layout">
      <section className="signature-entry">
        <div className="form-grid">
          <Field label="Firma de"><Select value={signerType} onChange={(event) => setSignerType(event.target.value as SignerType)}>
            {Object.entries(SIGNER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select></Field>
          <Field label="Nombre completo"><Input value={signerName} onChange={(event) => setSignerName(event.target.value)} /></Field>
        </div>
        <SignaturePad value={strokes} onChange={setStrokes} disabled={saveMutation.isPending} />
        <p className="signature-disclaimer"><CheckCircle2 />La firma queda vinculada al documento, usuario y fecha. No reemplaza una firma electronica certificada.</p>
        {error ? <div className="alert">{error}</div> : null}
      </section>
      <section className="signature-list">
        <h3>Firmas registradas</h3>
        {signaturesQuery.isLoading ? <TableSkeleton rows={2} /> : null}
        {signaturesQuery.error ? <div className="alert">{signaturesQuery.error instanceof Error ? signaturesQuery.error.message : "No se pudieron cargar las firmas."}</div> : null}
        {(signaturesQuery.data ?? []).map((signature) => <article className="signature-card" key={signature.id}>
          <SignaturePreview signature={signature} />
          <div><strong>{signature.firmante_nombre}</strong><span>{SIGNER_LABELS[signature.tipo_firmante]}</span><small>{toReadableDateLong(signature.firmado_at)}</small></div>
          <Button type="button" variant="danger" aria-label={"Eliminar firma de " + signature.firmante_nombre} disabled={deleteMutation.isPending}
            onClick={() => { if (confirm("Eliminar esta firma del documento? La accion quedara auditada.")) deleteMutation.mutate(signature.id); }}><Trash2 /></Button>
        </article>)}
        {!signaturesQuery.isLoading && !signaturesQuery.error && !(signaturesQuery.data ?? []).length ? <p className="muted">Este documento aun no tiene firmas.</p> : null}
      </section>
    </div>
  </Modal>;
}
