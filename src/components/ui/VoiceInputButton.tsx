import { useEffect, useId, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import type { VoiceInputMode } from "../../lib/voice";
import { Button } from "./Button";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: { transcript?: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorLike = {
  error: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type VoiceInputButtonProps = {
  onTranscript: (transcript: string) => void;
  disabled?: boolean;
  compact?: boolean;
  mode?: Exclude<VoiceInputMode, "off">;
};

let activeRecognition: SpeechRecognitionLike | null = null;

function recognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function voiceErrorMessage(code: string) {
  if (["not-allowed", "service-not-allowed"].includes(code)) {
    return "No pudimos acceder al microfono. Revisa los permisos del navegador.";
  }
  if (code === "audio-capture") return "No encontramos un microfono disponible.";
  if (code === "no-speech") return "No detectamos voz. Intenta hablar mas cerca del microfono.";
  if (code === "network") return "El reconocimiento de voz no esta disponible en este momento.";
  return "El dictado se interrumpio. Puedes intentarlo nuevamente.";
}

function idleLabel(mode: Exclude<VoiceInputMode, "off">) {
  if (mode === "digits") return "Dictar digitos";
  if (mode === "number") return "Dictar cantidad";
  return "Dictar texto";
}

export function VoiceInputButton({
  onTranscript,
  disabled = false,
  compact = false,
  mode = "text"
}: VoiceInputButtonProps) {
  const errorId = useId();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    recognition?.abort();
    if (activeRecognition === recognition) activeRecognition = null;
  }, []);

  useEffect(() => {
    if (!listening) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") recognitionRef.current?.stop();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [listening]);

  const stop = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const start = () => {
    setError(null);
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      setError("Este navegador no admite dictado por voz. Usa Chrome o Edge actualizado.");
      return;
    }

    activeRecognition?.abort();
    const recognition = new Recognition();
    recognition.lang = "es-PE";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) transcript += `${result[0]?.transcript ?? ""} `;
      }
      if (transcript.trim()) onTranscript(transcript.trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted") setError(voiceErrorMessage(event.error));
      setListening(false);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (activeRecognition === recognition) activeRecognition = null;
      setListening(false);
    };

    recognitionRef.current = recognition;
    activeRecognition = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      if (activeRecognition === recognition) activeRecognition = null;
      setListening(false);
      setError("No se pudo iniciar el dictado. Verifica el permiso del microfono.");
    }
  };

  const actionLabel = listening ? "Detener dictado" : idleLabel(mode);

  return (
    <div className={`voice-input${compact ? " voice-input--compact" : ""}`}>
      <Button
        type="button"
        variant={listening ? "primary" : "ghost"}
        className="voice-input__button"
        aria-pressed={listening}
        aria-label={actionLabel}
        aria-describedby={error ? errorId : undefined}
        title={listening ? "Detener dictado (Esc)" : `${idleLabel(mode)} con el microfono`}
        disabled={disabled}
        onClick={listening ? stop : start}
      >
        {listening ? <Square /> : <Mic />}
        {compact ? <span className="sr-only">{actionLabel}</span> : (listening ? "Escuchando..." : "Dictar")}
      </Button>
      {error ? <span id={errorId} className="voice-input__error" role="alert">{error}</span> : null}
    </div>
  );
}
