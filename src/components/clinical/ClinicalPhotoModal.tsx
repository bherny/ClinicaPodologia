import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Camera, ImagePlus } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { queryClient } from "../../lib/queryClient";
import { uploadClinicalPhoto } from "../../services/clinicalTimeline";
import type { EtapaFotoClinica, HistoriaClinicaDetalle } from "../../types/domain";
import { Button } from "../ui/Button";
import { Field, Input, Select, Textarea } from "../ui/Field";
import { Modal } from "../ui/Modal";

function localDateTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function ClinicalPhotoModal({ history, sessionId, onClose }: { history: HistoriaClinicaDetalle; sessionId?: string | null; onClose: () => void }) {
  const { profile } = useAuth();
  const [stage, setStage] = useState<EtapaFotoClinica>("seguimiento");
  const [takenAt, setTakenAt] = useState(localDateTime());
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("No se encontro el perfil activo.");
      if (!file) throw new Error("Toma o selecciona una fotografia.");
      return uploadClinicalPhoto({ history, sessionId, stage, takenAt: new Date(takenAt).toISOString(), note, file, profileId: profile.id });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clinical-timeline", history.id] });
      onClose();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "No se pudo guardar la fotografia.")
  });

  return (
    <Modal
      title="Agregar fotografia clinica"
      onClose={onClose}
      footer={<><Button type="button" onClick={onClose}>Cancelar</Button><Button form="clinical-photo-form" type="submit" variant="primary" disabled={mutation.isPending}>{mutation.isPending ? "Guardando..." : "Guardar fotografia"}</Button></>}
    >
      <form id="clinical-photo-form" className="form-stack" onSubmit={(event) => { event.preventDefault(); setError(""); mutation.mutate(); }}>
        {error ? <div className="alert alert--warning">{error}</div> : null}
        <div className="clinical-photo-privacy"><Camera /><div><strong>Registro privado del paciente</strong><span>La imagen se comprime antes de subir y solo puede verla personal clínico autorizado.</span></div></div>
        <Field label="Momento de la fotografia">
          <Select value={stage} onChange={(event) => setStage(event.target.value as EtapaFotoClinica)}>
            <option value="antes">Antes</option><option value="despues">Después</option><option value="seguimiento">Seguimiento</option><option value="otra">Otra</option>
          </Select>
        </Field>
        <Field label="Fecha y hora"><Input type="datetime-local" required value={takenAt} onChange={(event) => setTakenAt(event.target.value)} /></Field>
        <Field label="Foto">
          <label className="clinical-file-picker">
            <ImagePlus />
            <span>{file ? file.name : "Tomar foto o elegir de la galería"}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
        </Field>
        <Field label="Nota opcional"><Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Zona, procedimiento o cambio observado" /></Field>
      </form>
    </Modal>
  );
}
