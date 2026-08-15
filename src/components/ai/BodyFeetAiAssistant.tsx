import { useEffect, useRef, useState } from "react";
import { Copy, RotateCcw, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Field";
import { askBodyFeetAi, type AiConversationMessage } from "../../services/bodyFeetAi";
import { playUiSound } from "../../lib/sound";

type BodyFeetAiAssistantProps = {
  open: boolean;
  onClose: () => void;
};

const welcomeMessage: AiConversationMessage = {
  role: "assistant",
  content: "Hola. Soy la IA de Body Feet. Puedo ayudarte con procesos de la plataforma, redaccion profesional y explicaciones generales."
};

const suggestions = [
  "Como reprogramo una cita sin perder el historial?",
  "Ayudame a redactar un recordatorio profesional.",
  "Explicame un termino clinico de forma sencilla."
];

export function BodyFeetAiAssistant({ open, onClose }: BodyFeetAiAssistantProps) {
  const [messages, setMessages] = useState<AiConversationMessage[]>([welcomeMessage]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  const send = async (content = draft) => {
    const question = content.trim();
    if (!question || loading) return;

    const nextMessages: AiConversationMessage[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setDraft("");
    setError(null);
    setLoading(true);

    try {
      const answer = await askBodyFeetAi(nextMessages);
      setMessages((current) => [...current, { role: "assistant", content: answer }]);
      playUiSound("message");
    } catch (caughtError) {
      playUiSound("error");
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo consultar la IA.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMessages([welcomeMessage]);
    setDraft("");
    setError(null);
  };

  if (!open) return null;

  return (
    <>
      <button className="ai-assistant-backdrop" type="button" aria-label="Cerrar La IA de Body Feet" onClick={onClose} />
      <aside className="ai-assistant" role="dialog" aria-modal="true" aria-labelledby="body-feet-ai-title">
        <header className="ai-assistant__header">
          <img src="/body-feet-nurse.png" alt="" aria-hidden="true" />
          <div>
            <span><Sparkles aria-hidden="true" /> Asistente para el personal</span>
            <h2 id="body-feet-ai-title">La IA de Body Feet</h2>
          </div>
          <Button type="button" variant="ghost" aria-label="Cerrar asistente" onClick={onClose}><X /></Button>
        </header>

        <div className="ai-assistant__privacy" role="note">
          <ShieldCheck aria-hidden="true" />
          <p><strong>Protege al paciente.</strong> No escribas nombres, DNI, telefonos ni datos clinicos que identifiquen a una persona.</p>
        </div>

        <div className="ai-assistant__messages" aria-live="polite">
          {messages.map((message, index) => (
            <article className={`ai-message ai-message--${message.role}`} key={`${message.role}-${index}`}>
              <span>{message.role === "assistant" ? "Body Feet IA" : "Tu"}</span>
              <p>{message.content}</p>
              {message.role === "assistant" && index > 0 ? (
                <button
                  type="button"
                  className="ai-message__copy"
                  onClick={async () => {
                    await navigator.clipboard.writeText(message.content);
                    setCopiedIndex(index);
                    window.setTimeout(() => setCopiedIndex(null), 1_500);
                  }}
                >
                  <Copy aria-hidden="true" /> {copiedIndex === index ? "Copiado" : "Copiar"}
                </button>
              ) : null}
            </article>
          ))}
          {loading ? <div className="ai-assistant__thinking"><span /><span /><span /> Preparando respuesta segura...</div> : null}
          <div ref={endRef} />
        </div>

        {messages.length === 1 ? (
          <div className="ai-assistant__suggestions" aria-label="Preguntas sugeridas">
            {suggestions.map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => void send(suggestion)}>{suggestion}</button>
            ))}
          </div>
        ) : null}

        {error ? <div className="alert alert--warning" role="alert">{error}</div> : null}

        <footer className="ai-assistant__composer">
          <Textarea
            rows={3}
            maxLength={2_000}
            value={draft}
            placeholder="Escribe o dicta una pregunta..."
            aria-label="Pregunta para La IA de Body Feet"
            disabled={loading}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div>
            <Button type="button" variant="ghost" onClick={reset} disabled={loading || messages.length === 1}>
              <RotateCcw aria-hidden="true" /> Limpiar
            </Button>
            <Button type="button" variant="primary" onClick={() => void send()} disabled={loading || !draft.trim()}>
              <Send aria-hidden="true" /> Enviar
            </Button>
          </div>
          <small>La IA puede equivocarse. Verifica siempre la informacion clinica o administrativa importante.</small>
        </footer>
      </aside>
    </>
  );
}
