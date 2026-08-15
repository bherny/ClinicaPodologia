import { supabase } from "../lib/supabase";
import { prepareAiMessages, type AiConversationMessage } from "../lib/aiPrivacy";

type BodyFeetAiResponse = {
  answer?: string;
  error?: string;
  model?: string;
  privacy_redacted?: boolean;
};

async function readFunctionError(error: unknown) {
  const response = (error as { context?: Response })?.context;
  if (response instanceof Response) {
    try {
      const payload = await response.clone().json() as BodyFeetAiResponse;
      if (payload.error) return payload.error;
    } catch {
      // Supabase can return a non-JSON gateway error.
    }
  }
  return null;
}

export async function askBodyFeetAi(messages: AiConversationMessage[]) {
  const prepared = prepareAiMessages(messages);
  if (!prepared.length) throw new Error("Escribe una pregunta para continuar.");

  const { data, error } = await supabase.functions.invoke<BodyFeetAiResponse>("body-feet-ai", {
    body: { messages: prepared }
  });

  if (error) {
    const functionMessage = await readFunctionError(error);
    throw new Error(functionMessage ?? "La IA de Body Feet no esta disponible en este momento.");
  }

  if (!data?.answer) throw new Error(data?.error ?? "La IA no devolvio una respuesta valida.");
  return data.answer;
}

export type { AiConversationMessage };
