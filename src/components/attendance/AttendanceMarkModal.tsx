import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, CheckCircle2, Clock3, RefreshCcw, Upload } from "lucide-react";
import { Button } from "../ui/Button";
import { Field, Select } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { useAuth } from "../../context/AuthContext";
import { queryClient } from "../../lib/queryClient";
import { fullName } from "../../lib/format";
import { toLimaTime12, toReadableTime12 } from "../../lib/date";
import {
  getAttendanceContext,
  registerAttendanceMark,
  removeAttendanceEvidence,
  uploadAttendanceEvidence
} from "../../services/attendance";
import { listProfessionals } from "../../services/catalog";

type Props = {
  branchId: string;
  onClose: () => void;
};

function clock(value?: string | null) {
  return toLimaTime12(value, true);
}

async function drawSourceToWebp(source: CanvasImageSource, width: number, height: number) {
  const maxWidth = 1280;
  const scale = Math.min(1, maxWidth / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no pudo procesar la fotografia.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("No se pudo comprimir la fotografia.")),
      "image/webp",
      0.78
    );
  });
}

async function fileToWebp(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    return await drawSourceToWebp(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

export function AttendanceMarkModal({ branchId, onClose }: Props) {
  const { profile } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ type: "entrada" | "salida"; at: string; status: string } | null>(null);
  const [displayNow, setDisplayNow] = useState(new Date());
  const [selectedProfessionalId, setSelectedProfessionalId] = useState("");
  const canChooseProfessional = profile?.rol === "administrador" || profile?.rol === "owner";
  const professionalsQuery = useQuery({
    queryKey: ["attendance-professional-options"],
    queryFn: () => listProfessionals(false),
    enabled: canChooseProfessional
  });

  const contextQuery = useQuery({
    queryKey: ["my-attendance-context", branchId, selectedProfessionalId],
    queryFn: () => getAttendanceContext(branchId, selectedProfessionalId || null),
    enabled: !canChooseProfessional || !!selectedProfessionalId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false
  });
  const context = contextQuery.data;

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    const timer = window.setInterval(() => setDisplayNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!context?.linked || !context.branch_id || success || photo) return;
    let active = true;
    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Este navegador no permite usar la camara. Puedes seleccionar una fotografia.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraError(null);
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        const message = name === "NotAllowedError"
          ? "Permiso de camara rechazado. Habilitalo o selecciona una fotografia."
          : name === "NotFoundError"
            ? "No se encontro una camara en este dispositivo."
            : "La camara no esta disponible o esta siendo utilizada por otra aplicacion.";
        setCameraError(message);
      }
    }
    void startCamera();
    return () => {
      active = false;
      stopCamera();
    };
  }, [context?.branch_id, context?.linked, photo, success]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const setCompressedPhoto = (blob: Blob) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhoto(blob);
    setPreviewUrl(URL.createObjectURL(blob));
  };

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setCameraError("Espera un momento a que la camara termine de iniciar.");
      return;
    }
    try {
      setCompressedPhoto(await drawSourceToWebp(video, video.videoWidth, video.videoHeight));
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "No se pudo tomar la fotografia.");
    }
  };

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setCompressedPhoto(await fileToWebp(file));
      setCameraError(null);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "No se pudo procesar la fotografia.");
    }
  };

  const markMutation = useMutation({
    mutationFn: async () => {
      if (!photo || !context?.professional || !context.branch_id || !context.expected_type || !context.local_date) {
        throw new Error("Falta la fotografia o la informacion de la marcacion.");
      }
      const freshContext = await getAttendanceContext(context.branch_id, context.professional.id);
      if (!freshContext.linked || !freshContext.professional || !freshContext.local_date || !freshContext.expected_type || !freshContext.branch_id) {
        throw new Error(freshContext.message ?? "No se pudo actualizar el estado de la jornada.");
      }
      if (freshContext.expected_type !== context.expected_type) {
        throw new Error("La jornada cambio mientras el formulario estaba abierto. Cierra y vuelve a abrir la marcacion.");
      }
      const requestId = crypto.randomUUID();
      const path = `attendance/${freshContext.professional.id}/${freshContext.local_date}/${freshContext.expected_type}-${requestId}.webp`;
      await uploadAttendanceEvidence(path, photo);
      try {
        return await registerAttendanceMark({
          professionalId: freshContext.professional.id,
          branchId: freshContext.branch_id,
          photoPath: path,
          expectedType: freshContext.expected_type,
          requestId
        });
      } catch (error) {
        await removeAttendanceEvidence(path);
        throw error;
      }
    },
    onSuccess: (result) => {
      stopCamera();
      setSuccess({ type: result.type, at: result.recorded_at, status: result.status });
      queryClient.invalidateQueries({ queryKey: ["my-attendance-context"] });
      queryClient.invalidateQueries({ queryKey: ["owner-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["owner-attendance-dashboard"] });
    }
  });

  const title = context?.expected_type === "salida" ? "Marcar salida" : "Marcar entrada";
  const statusLabel = useMemo(() => ({
    a_tiempo: "A tiempo",
    tardanza: "Tardanza",
    sin_turno: "Sin turno asignado",
    turno_completado: "Turno completado"
  }[success?.status ?? ""] ?? success?.status), [success?.status]);

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={success ? (
        <Button type="button" variant="primary" onClick={onClose}>Cerrar</Button>
      ) : (
        <>
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button
            type="button"
            variant="primary"
            disabled={!photo || markMutation.isPending || !context?.branch_id}
            onClick={() => markMutation.mutate()}
          >
            <CheckCircle2 />
            {markMutation.isPending ? "Registrando..." : `Confirmar ${context?.expected_type ?? "marcacion"}`}
          </Button>
        </>
      )}
    >
      {canChooseProfessional ? (
        <section className="attendance-professional-picker">
          <Field label="Profesional que va a marcar">
            <Select
              value={selectedProfessionalId}
              disabled={professionalsQuery.isLoading || markMutation.isPending}
              onChange={(event) => {
                stopCamera();
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPhoto(null);
                setPreviewUrl(null);
                setCameraError(null);
                setSuccess(null);
                setSelectedProfessionalId(event.target.value);
              }}
            >
              <option value="">Seleccionar profesional</option>
              {(professionalsQuery.data ?? []).map((professional) => (
                <option value={professional.id} key={professional.id}>{fullName(professional)}{professional.especialidad ? ` · ${professional.especialidad}` : ""}</option>
              ))}
            </Select>
          </Field>
          <p>Selecciona la persona. El sistema detectara automaticamente si corresponde entrada o salida.</p>
        </section>
      ) : null}
      {canChooseProfessional && !selectedProfessionalId ? <div className="alert alert--info">Selecciona un profesional para iniciar la camara y consultar su turno.</div> : null}
      {contextQuery.isLoading ? <div className="attendance-loading">Verificando tu jornada...</div> : null}
      {contextQuery.isError ? <div className="alert">{contextQuery.error instanceof Error ? contextQuery.error.message : "No se pudo verificar la jornada."}</div> : null}
      {context && !context.linked ? <div className="alert">{context.message}</div> : null}
      {context?.linked && context.message ? <div className="alert">{context.message}</div> : null}

      {success ? (
        <section className="attendance-success">
          <CheckCircle2 />
          <h3>{success.type === "entrada" ? "Entrada registrada correctamente" : "Salida registrada correctamente"}</h3>
          <strong>{clock(success.at)}</strong>
          <span>{statusLabel}</span>
          <small>La hora fue registrada por el servidor de Body Feet.</small>
        </section>
      ) : context?.linked && context.branch_id ? (
        <div className="attendance-mark">
          <section className="attendance-summary">
            <div>
              <span>Profesional</span>
              <strong>{fullName(context.professional)}</strong>
              <small>{context.professional?.especialidad || "Profesional Body Feet"}</small>
            </div>
            <div>
              <span>Hora en Lima</span>
              <strong><Clock3 /> {clock(displayNow.toISOString())}</strong>
              <small>La hora final se obtiene del servidor</small>
            </div>
            <div>
              <span>Turno</span>
              <strong>{context.shift?.es_descanso ? "Dia libre" : context.shift ? `${toReadableTime12(context.shift.hora_inicio)} - ${toReadableTime12(context.shift.hora_fin)}` : "Sin turno"}</strong>
              <small>{context.shift ? `Tolerancia: ${context.shift.tolerancia_minutos} min` : "Puedes marcar; quedara como sin turno"}</small>
            </div>
          </section>

          {context.expected_type === "salida" ? (
            <div className="alert alert--info attendance-open-session" role="status">
              <Clock3 />
              <div>
                <strong>Entrada abierta desde {clock(context.open_since)}</strong>
                <span>La hora se detecto automaticamente. Esta marcacion registrara tu salida.</span>
              </div>
            </div>
          ) : null}

          <section className="attendance-camera">
            {previewUrl ? (
              <img className="attendance-camera__preview" src={previewUrl} alt="Vista previa de la evidencia" />
            ) : (
              <video ref={videoRef} autoPlay muted playsInline aria-label="Vista de la camara" />
            )}
            {!previewUrl ? <span className="attendance-camera__guide"><Camera /> Centra tu rostro antes de tomar la foto</span> : null}
          </section>

          {cameraError ? <div className="alert alert--info">{cameraError}</div> : null}
          {markMutation.isError ? <div className="alert">{markMutation.error instanceof Error ? markMutation.error.message : "No se pudo registrar la marcacion."}</div> : null}

          <div className="attendance-camera__actions">
            {previewUrl ? (
              <Button type="button" onClick={() => { setPhoto(null); setPreviewUrl(null); }}><RefreshCcw /> Repetir foto</Button>
            ) : (
              <Button type="button" variant="primary" onClick={() => void takePhoto()}><Camera /> Tomar fotografia</Button>
            )}
            <label className="button attendance-file-button">
              <Upload /> Seleccionar foto
              <input type="file" accept="image/*" capture="user" onChange={(event) => void choosePhoto(event)} />
            </label>
          </div>
          <p className="attendance-privacy">La evidencia se comprime y se guarda en un espacio privado. Solo la propietaria autorizada puede consultarla.</p>
        </div>
      ) : null}
    </Modal>
  );
}
