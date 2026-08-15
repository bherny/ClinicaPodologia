import { createClient } from "jsr:@supabase/supabase-js@2";

type ConversationMessage = { role: "user" | "assistant"; content: string };

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_TOTAL_CHARS = 12_000;
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const DOCUMENT_PATTERN = /\b(D\.?N\.?I\.?|RUC|C\.?E\.?)\s*[:#-]?\s*\d{6,12}\b/gi;
const PERU_PHONE_PATTERN = /(?<!\d)(?:\+?51[\s-]?)?9(?:[\s-]?\d){8}(?!\d)/g;

function redactSensitiveText(value: string) {
  return value
    .replace(EMAIL_PATTERN, "[correo protegido]")
    .replace(DOCUMENT_PATTERN, (_match, label: string) => `${label} [documento protegido]`)
    .replace(PERU_PHONE_PATTERN, "[telefono protegido]");
}

function getAllowedOrigins() {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  const configured = getAllowedOrigins();
  if (!configured.length) return true;
  return configured.includes(origin);
}

function corsHeaders(origin: string | null) {
  const configured = getAllowedOrigins();
  const allowOrigin = origin && (configured.length === 0 || configured.includes(origin)) ? origin : configured[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function jsonResponse(origin: string | null, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" }
  });
}

function sanitizeMessages(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Formato de conversacion invalido.");
  const selected = value.slice(-MAX_MESSAGES);
  let total = 0;
  let redacted = false;
  const messages: ConversationMessage[] = [];

  for (const item of selected) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const rawContent = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof rawContent !== "string") continue;
    const trimmed = rawContent.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!trimmed) continue;
    const content = redactSensitiveText(trimmed);
    if (content !== trimmed) redacted = true;
    total += content.length;
    if (total > MAX_TOTAL_CHARS) throw new Error("La conversacion es demasiado extensa. Inicia una nueva consulta.");
    messages.push({ role, content });
  }

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    throw new Error("Escribe una pregunta para continuar.");
  }
  return { messages, redacted, total };
}

function extractAnswer(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices[0];
  if (firstChoice && typeof firstChoice === "object") {
    const message = (firstChoice as { message?: unknown }).message;
    if (message && typeof message === "object") {
      const content = (message as { content?: unknown }).content;
      if (typeof content === "string" && content.trim()) return content.trim();
    }
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "message") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: unknown }).type === "output_text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string" && text.trim()) parts.push(text.trim());
      }
    }
  }
  return parts.join("\n\n");
}

const INSTRUCTIONS = `Eres "La IA de Body Feet", un asistente interno para el personal de una clinica de podologia y rehabilitacion en Peru.
Responde en espanol claro, profesional y conciso. Ayuda con procesos administrativos, uso de la plataforma, redaccion de mensajes, organizacion y explicaciones educativas generales.
No tienes acceso en tiempo real a pacientes, citas, historias clinicas, caja ni configuraciones. Nunca afirmes que consultaste o modificaste datos del sistema.
No solicites nombres, DNI, telefonos, correos ni datos clinicos que identifiquen a una persona. Si aparecen marcadores de datos protegidos, continua sin intentar reconstruirlos.
No diagnostiques, no prescribas y no sustituyas el criterio de un profesional habilitado. Ante una consulta clinica, ofrece informacion general, indica limites y recomienda evaluacion profesional. Ante signos de urgencia, recomienda contactar servicios de emergencia locales.
No inventes leyes, precios, resultados ni funciones de la plataforma. Cuando no tengas certeza, dilo y propone un siguiente paso verificable.`;

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return jsonResponse(origin, 405, { error: "Metodo no permitido." });
  if (!isAllowedOrigin(origin)) return jsonResponse(origin, 403, { error: "Origen no autorizado." });

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return jsonResponse(origin, 401, { error: "Inicia sesion para usar la IA." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const groqKey = Deno.env.get("GROQ_API_KEY");
  const model = Deno.env.get("GROQ_MODEL") ?? DEFAULT_MODEL;
  if (!supabaseUrl || !supabaseAnonKey) return jsonResponse(origin, 503, { error: "La funcion no tiene configuracion de Supabase." });
  if (!groqKey) return jsonResponse(origin, 503, { error: "La IA aun no fue activada por el administrador." });

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return jsonResponse(origin, 401, { error: "Tu sesion vencio. Vuelve a iniciar sesion." });

  const { data: quotaData, error: quotaError } = await client.rpc("consume_body_feet_ai_quota");
  if (quotaError) return jsonResponse(origin, 403, { error: "Tu perfil no tiene acceso a La IA de Body Feet." });
  const quota = Array.isArray(quotaData) ? quotaData[0] : quotaData;
  if (!quota?.permitido) {
    await client.rpc("record_body_feet_ai_usage", {
      p_model: model,
      p_status: "limitado",
      p_input_chars: 0,
      p_output_chars: 0,
      p_error_code: "rate_limit"
    });
    return jsonResponse(origin, 429, {
      error: `Alcanzaste el limite temporal. Intenta nuevamente en ${quota?.reintentar_en_segundos ?? 300} segundos.`
    });
  }

  let sanitized: ReturnType<typeof sanitizeMessages>;
  try {
    const body = await request.json();
    sanitized = sanitizeMessages(body?.messages);
  } catch (error) {
    return jsonResponse(origin, 400, { error: error instanceof Error ? error.message : "Solicitud invalida." });
  }

  try {
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `${INSTRUCTIONS}\nContexto autorizado: rol ${quota.rol ?? "personal"}; sede ${quota.sede_id ?? "no asignada"}.`
          },
          ...sanitized.messages
        ],
        temperature: 0.2,
        max_completion_tokens: 900
      })
    });

    if (!groqResponse.ok) {
      await client.rpc("record_body_feet_ai_usage", {
        p_model: model,
        p_status: "error",
        p_input_chars: sanitized.total,
        p_output_chars: 0,
        p_error_code: `groq_${groqResponse.status}`
      });
      const publicMessage = groqResponse.status === 429
        ? "La IA alcanzo temporalmente el limite del plan gratuito. Intenta nuevamente en unos minutos."
        : "El servicio de IA no pudo responder en este momento.";
      return jsonResponse(origin, 502, { error: publicMessage });
    }

    const payload = await groqResponse.json() as Record<string, unknown>;
    const answer = extractAnswer(payload);
    if (!answer) throw new Error("empty_response");

    await client.rpc("record_body_feet_ai_usage", {
      p_model: model,
      p_status: "ok",
      p_input_chars: sanitized.total,
      p_output_chars: answer.length,
      p_error_code: null
    });
    return jsonResponse(origin, 200, { answer, model, privacy_redacted: sanitized.redacted });
  } catch {
    await client.rpc("record_body_feet_ai_usage", {
      p_model: model,
      p_status: "error",
      p_input_chars: sanitized.total,
      p_output_chars: 0,
      p_error_code: "unexpected"
    });
    return jsonResponse(origin, 500, { error: "La IA no esta disponible en este momento. Intenta nuevamente." });
  }
});
