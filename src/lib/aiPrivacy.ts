export type AiConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const DOCUMENT_PATTERN = /\b(D\.?N\.?I\.?|RUC|C\.?E\.?)\s*[:#-]?\s*\d{6,12}\b/gi;
const PERU_PHONE_PATTERN = /(?<!\d)(?:\+?51[\s-]?)?9(?:[\s-]?\d){8}(?!\d)/g;

export function redactSensitiveAiText(value: string) {
  return value
    .replace(EMAIL_PATTERN, "[correo protegido]")
    .replace(DOCUMENT_PATTERN, (_match, label: string) => `${label} [documento protegido]`)
    .replace(PERU_PHONE_PATTERN, "[telefono protegido]");
}

export function prepareAiMessages(messages: AiConversationMessage[]) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: redactSensitiveAiText(message.content.trim()).slice(0, 2_000)
    }))
    .filter((message) => message.content.length > 0);
}
