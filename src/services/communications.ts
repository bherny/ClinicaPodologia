import { supabase } from "../lib/supabase";

const db = supabase as any;
export type TeamChannel = string | "general";
export type InternalMessage = {
  id: string; autor_id: string; autor_nombre: string; autor_rol: string; sede_id: string | null;
  contenido: string; respuesta_a_id: string | null; eliminado: boolean; created_at: string; updated_at: string;
  respuesta?: Pick<InternalMessage, "id" | "autor_nombre" | "contenido" | "eliminado"> | null;
};
export type CommunityComment = {
  id: string; comunicado_id: string; autor_id: string; autor_nombre: string; autor_rol: string;
  contenido: string; eliminado: boolean; created_at: string; updated_at: string;
};
export type CommunityPost = {
  id: string; autor_id: string; autor_nombre: string; autor_rol: string; sede_id: string | null;
  tipo: "novedad" | "evidencia" | "incidencia" | "logro"; titulo: string; contenido: string;
  evidencia_path: string | null; evidencia_url?: string | null; fijado: boolean; eliminado: boolean;
  created_at: string; updated_at: string; comentarios: CommunityComment[];
};

function communicationError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (/schema cache|PGRST205|does not exist/i.test(message)) return new Error("Activa las migraciones 202608260001 y 202608260002 en Supabase.");
  if (/row-level security|permission/i.test(message)) return new Error("Tu perfil no tiene permiso para realizar esta accion.");
  return new Error(message || fallback);
}
function applyChannel(query: any, channel: TeamChannel) {
  return channel === "general" ? query.is("sede_id", null) : query.eq("sede_id", channel);
}
export async function listInternalMessages(channel: TeamChannel) {
  let query = db.from("mensajes_internos").select("*").eq("eliminado", false).order("created_at", { ascending: false }).limit(100);
  query = applyChannel(query, channel);
  const { data, error } = await query;
  if (error) throw communicationError(error, "No se pudieron cargar los mensajes.");

  const messages = ((data ?? []) as InternalMessage[]).reverse();
  const messageById = new Map(messages.map((item) => [item.id, item]));
  const missingReplyIds = [...new Set(messages
    .map((item) => item.respuesta_a_id)
    .filter((id): id is string => Boolean(id) && !messageById.has(id as string)))];

  if (missingReplyIds.length) {
    const { data: replyData, error: replyError } = await db.from("mensajes_internos")
      .select("id,autor_nombre,contenido,eliminado")
      .in("id", missingReplyIds)
      .eq("eliminado", false);
    if (replyError) throw communicationError(replyError, "No se pudieron cargar los mensajes respondidos.");
    for (const reply of replyData ?? []) messageById.set(reply.id, reply as InternalMessage);
  }

  return messages.map((item) => ({
    ...item,
    respuesta: item.respuesta_a_id ? messageById.get(item.respuesta_a_id) ?? null : null
  }));
}
export async function sendInternalMessage(channel: TeamChannel, content: string, replyToId: string | null = null) {
  const { error } = await db.from("mensajes_internos").insert({
    sede_id: channel === "general" ? null : channel,
    contenido: content.trim(),
    respuesta_a_id: replyToId
  });
  if (error) throw communicationError(error, "No se pudo enviar el mensaje.");
}
export async function deleteInternalMessage(id: string) {
  const { error } = await db.rpc("soft_delete_internal_message", { p_message_id: id });
  if (error) throw communicationError(error, "No se pudo eliminar el mensaje.");
}

async function signedEvidenceUrl(path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from("team-evidence").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
export async function listCommunityPosts(channel: TeamChannel) {
  let query = db.from("comunicados").select("*, comentarios:comentarios_comunicado(*)").eq("eliminado", false)
    .order("fijado", { ascending: false }).order("created_at", { ascending: false }).limit(60);
  query = applyChannel(query, channel);
  const { data, error } = await query;
  if (error) throw communicationError(error, "No se pudieron cargar las novedades.");
  return Promise.all(((data ?? []) as CommunityPost[]).map(async (post) => ({
    ...post,
    comentarios: (post.comentarios ?? []).filter((comment) => !comment.eliminado).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    evidencia_url: await signedEvidenceUrl(post.evidencia_path)
  })));
}
export async function uploadCommunityEvidence(profileId: string, file: File) {
  if (file.size > 8 * 1024 * 1024) throw new Error("El archivo supera el limite de 8 MB.");
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) throw new Error("Adjunta una imagen o PDF.");
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = profileId + "/" + crypto.randomUUID() + "." + extension;
  const { error } = await supabase.storage.from("team-evidence").upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw communicationError(error, "No se pudo subir la evidencia.");
  return path;
}
export async function createCommunityPost(input: {
  channel: TeamChannel; type: CommunityPost["tipo"]; title: string; content: string; evidencePath?: string | null; pinned?: boolean;
}) {
  const { error } = await db.from("comunicados").insert({
    sede_id: input.channel === "general" ? null : input.channel, tipo: input.type, titulo: input.title.trim(),
    contenido: input.content.trim(), evidencia_path: input.evidencePath ?? null, fijado: input.pinned ?? false
  });
  if (error) throw communicationError(error, "No se pudo publicar la novedad.");
}
export async function deleteCommunityPost(id: string) {
  const { error } = await db.rpc("soft_delete_community_post", { p_post_id: id });
  if (error) throw communicationError(error, "No se pudo eliminar la publicacion.");
}
export async function createCommunityComment(postId: string, content: string) {
  const { error } = await db.from("comentarios_comunicado").insert({ comunicado_id: postId, contenido: content.trim() });
  if (error) throw communicationError(error, "No se pudo publicar el comentario.");
}
export async function deleteCommunityComment(id: string) {
  const { error } = await db.rpc("soft_delete_community_comment", { p_comment_id: id });
  if (error) throw communicationError(error, "No se pudo eliminar el comentario.");
}
export function subscribeToTeamCommunication(onChange: () => void) {
  const channel = supabase.channel("body-feet-team-communication")
    .on("postgres_changes", { event: "*", schema: "public", table: "mensajes_internos" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "comunicados" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "comentarios_comunicado" }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
