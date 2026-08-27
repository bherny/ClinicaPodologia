import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, MessageSquareText, Newspaper, Paperclip, Pin, Reply, Send, Trash2, X } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";
import { TableSkeleton } from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { useBranch } from "../context/BranchContext";
import { queryClient } from "../lib/queryClient";
import {
  createCommunityComment,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  deleteInternalMessage,
  listCommunityPosts,
  listInternalMessages,
  sendInternalMessage,
  subscribeToTeamCommunication,
  uploadCommunityEvidence,
  type CommunityPost,
  type InternalMessage,
  type TeamChannel
} from "../services/communications";

const POST_LABELS: Record<CommunityPost["tipo"], string> = {
  novedad: "Novedad", evidencia: "Evidencia", incidencia: "Incidencia", logro: "Logro"
};
function readableMoment(value: string) {
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function CommunityPage() {
  const { profile } = useAuth();
  const { branches, selectedBranchId } = useBranch();
  const [view, setView] = useState<"chat" | "news">("chat");
  const [channel, setChannel] = useState<TeamChannel>(selectedBranchId === "all" ? "general" : selectedBranchId);
  const [message, setMessage] = useState("");
  const [replyingTo, setReplyingTo] = useState<InternalMessage | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [postType, setPostType] = useState<CommunityPost["tipo"]>("novedad");
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  const messagesQuery = useQuery({
    queryKey: ["internal-messages", channel],
    queryFn: () => listInternalMessages(channel),
    enabled: view === "chat",
    staleTime: 30_000
  });
  const postsQuery = useQuery({
    queryKey: ["community-posts", channel],
    queryFn: () => listCommunityPosts(channel),
    enabled: view === "news",
    staleTime: 30_000
  });

  useEffect(() => subscribeToTeamCommunication(() => {
    queryClient.invalidateQueries({ queryKey: ["internal-messages"] });
    queryClient.invalidateQueries({ queryKey: ["community-posts"] });
  }), []);

  useEffect(() => {
    if (view === "chat") chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data, view]);

  const sendMutation = useMutation({
    mutationFn: () => sendInternalMessage(channel, message, replyingTo?.id ?? null),
    onSuccess: () => { setMessage(""); setReplyingTo(null); setError(null); queryClient.invalidateQueries({ queryKey: ["internal-messages", channel] }); },
    onError: (nextError) => setError(errorMessage(nextError, "No se pudo enviar el mensaje."))
  });
  const deleteMessageMutation = useMutation({
    mutationFn: deleteInternalMessage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["internal-messages", channel] }),
    onError: (nextError) => setError(errorMessage(nextError, "No se pudo eliminar el mensaje."))
  });
  const deleteCommentMutation = useMutation({
    mutationFn: deleteCommunityComment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["community-posts", channel] }),
    onError: (nextError) => setError(errorMessage(nextError, "No se pudo eliminar el comentario."))
  });
  const postMutation = useMutation({
    mutationFn: async () => {
      const evidencePath = evidence && profile ? await uploadCommunityEvidence(profile.id, evidence) : null;
      await createCommunityPost({ channel, type: postType, title: postTitle, content: postContent, evidencePath });
    },
    onSuccess: () => {
      setPostTitle(""); setPostContent(""); setEvidence(null); setError(null);
      queryClient.invalidateQueries({ queryKey: ["community-posts", channel] });
    },
    onError: (nextError) => setError(errorMessage(nextError, "No se pudo publicar la novedad."))
  });
  const deletePostMutation = useMutation({
    mutationFn: deleteCommunityPost,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["community-posts", channel] }),
    onError: (nextError) => setError(errorMessage(nextError, "No se pudo eliminar la publicacion."))
  });
  const commentMutation = useMutation({
    mutationFn: ({ postId, content }: { postId: string; content: string }) => createCommunityComment(postId, content),
    onSuccess: (_, variables) => {
      setCommentDrafts((current) => ({ ...current, [variables.postId]: "" }));
      queryClient.invalidateQueries({ queryKey: ["community-posts", channel] });
    },
    onError: (nextError) => setError(errorMessage(nextError, "No se pudo publicar el comentario."))
  });

  const channelName = useMemo(() => channel === "general" ? "General" : branches.find((branch) => branch.id === channel)?.nombre ?? "Sede", [branches, channel]);
  return <main className="page community-page">
    <PageHeader eyebrow="Equipo Body Feet" title="Comunicacion interna" description="Conversa por sede y deja novedades, incidencias o evidencias con fecha y autor." />
    <div className="community-toolbar">
      <div className="tabs community-tabs" role="tablist">
        <button type="button" className={view === "chat" ? "tab tab--active" : "tab"} onClick={() => setView("chat")}><MessageSquareText /> Chat</button>
        <button type="button" className={view === "news" ? "tab tab--active" : "tab"} onClick={() => setView("news")}><Newspaper /> Novedades</button>
      </div>
      <Field label="Canal">
        <Select value={channel} onChange={(event) => { setChannel(event.target.value); setReplyingTo(null); }}>
          <option value="general">General - todas las sedes</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}</option>)}
        </Select>
      </Field>
    </div>
    {error ? <div className="alert" style={{ marginBottom: 14 }}>{error}</div> : null}

    {view === "chat" ? <Card title={"Chat - " + channelName} className="team-chat-card">
      {messagesQuery.isLoading ? <TableSkeleton rows={5} /> : null}
      {messagesQuery.error ? <div className="alert">{errorMessage(messagesQuery.error, "No se pudo cargar el chat.")}</div> : null}
      <div className="team-chat" aria-live="polite">
        {(messagesQuery.data ?? []).map((item) => {
          const own = item.autor_id === profile?.id;
          return <article key={item.id} className={own ? "team-message team-message--own" : "team-message"}>
            <div className="team-message__meta"><strong>{item.autor_nombre}</strong><span>{readableMoment(item.created_at)}</span></div>
            {item.respuesta_a_id ? (
              <div className="team-message__reply-context">
                <strong>{item.respuesta?.autor_nombre ?? "Mensaje eliminado"}</strong>
                <span>{item.respuesta?.contenido ?? "El mensaje original ya no esta disponible."}</span>
              </div>
            ) : null}
            <p>{item.contenido}</p>
            <div className="team-message__actions">
              <button type="button" title="Responder mensaje" onClick={() => {
                setReplyingTo(item);
                window.setTimeout(() => composerRef.current?.focus(), 0);
              }}><Reply /></button>
              <button type="button" title="Eliminar mensaje" onClick={() => {
                if (confirm("Eliminar este mensaje? La accion quedara auditada.")) deleteMessageMutation.mutate(item.id);
              }}><Trash2 /></button>
            </div>
          </article>;
        })}
        {!messagesQuery.isLoading && !(messagesQuery.data ?? []).length ? <EmptyState title="Aun no hay mensajes" description="Inicia la conversacion del equipo en este canal." /> : null}
        <div ref={chatEnd} />
      </div>
      <form className="team-composer" onSubmit={(event) => { event.preventDefault(); if (message.trim()) sendMutation.mutate(); }}>
        {replyingTo ? <div className="team-replying">
          <Reply />
          <div><strong>Respondiendo a {replyingTo.autor_nombre}</strong><span>{replyingTo.contenido}</span></div>
          <button type="button" title="Cancelar respuesta" onClick={() => setReplyingTo(null)}><X /></button>
        </div> : null}
        <Textarea ref={composerRef} rows={2} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)}
          placeholder={replyingTo ? "Escribe tu respuesta..." : "Escribe o dicta un mensaje para el equipo..."} />
        <Button type="submit" variant="primary" disabled={sendMutation.isPending || !message.trim()}><Send /> {replyingTo ? "Responder" : "Enviar"}</Button>
      </form>
    </Card> : <div className="community-news-layout">
      <Card title="Nueva publicacion">
        <div className="form-grid">
          <Field label="Tipo"><Select value={postType} onChange={(event) => setPostType(event.target.value as CommunityPost["tipo"])}>
            {Object.entries(POST_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select></Field>
          <Field label="Titulo"><Input maxLength={140} value={postTitle} onChange={(event) => setPostTitle(event.target.value)} placeholder="Resumen claro de lo ocurrido" /></Field>
          <div className="span-2"><Field label="Detalle"><Textarea rows={4} maxLength={4000} value={postContent} onChange={(event) => setPostContent(event.target.value)} placeholder="Que se hizo, resultado y seguimiento..." /></Field></div>
          <div className="span-2"><label className="evidence-picker"><Paperclip /><span>{evidence ? evidence.name : "Adjuntar imagen o PDF como evidencia"}</span><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setEvidence(event.target.files?.[0] ?? null)} /></label></div>
        </div>
        <Button type="button" variant="primary" disabled={postMutation.isPending || postTitle.trim().length < 3 || postContent.trim().length < 3} onClick={() => postMutation.mutate()}>
          <Newspaper />{postMutation.isPending ? "Publicando..." : "Publicar"}
        </Button>
      </Card>
      <section className="community-feed">
        {postsQuery.isLoading ? <TableSkeleton rows={5} /> : null}
        {postsQuery.error ? <div className="alert">{errorMessage(postsQuery.error, "No se pudieron cargar las novedades.")}</div> : null}
        {(postsQuery.data ?? []).map((post) => <Card key={post.id} className="community-post">
          <header className="community-post__header">
            <div><span className={"community-badge community-badge--" + post.tipo}>{POST_LABELS[post.tipo]}</span>{post.fijado ? <span className="community-pinned"><Pin /> Fijado</span> : null}</div>
            <Button type="button" variant="danger" title="Eliminar publicacion" onClick={() => { if (confirm("Eliminar esta publicacion? La accion quedara auditada.")) deletePostMutation.mutate(post.id); }}><Trash2 /></Button>
          </header>
          <h2>{post.titulo}</h2>
          <p className="community-post__content">{post.contenido}</p>
          {post.evidencia_url ? (post.evidencia_path?.toLowerCase().endsWith(".pdf")
            ? <a className="community-evidence-link" href={post.evidencia_url} target="_blank" rel="noreferrer"><FileText /> Abrir evidencia PDF</a>
            : <a href={post.evidencia_url} target="_blank" rel="noreferrer"><img className="community-evidence-image" src={post.evidencia_url} alt={"Evidencia de " + post.titulo} loading="lazy" /></a>) : null}
          <div className="community-post__byline"><strong>{post.autor_nombre}</strong><span>{readableMoment(post.created_at)} · {channelName}</span></div>
          <div className="community-comments">
            {post.comentarios.map((comment) => <div key={comment.id} className="community-comment"><strong>{comment.autor_nombre}</strong><p>{comment.contenido}</p><small>{readableMoment(comment.created_at)}</small><button type="button" title="Eliminar comentario" onClick={() => { if (confirm("Eliminar este comentario? La accion quedara auditada.")) deleteCommentMutation.mutate(comment.id); }}><Trash2 /></button></div>)}
            <form onSubmit={(event) => { event.preventDefault(); const content = commentDrafts[post.id]?.trim(); if (content) commentMutation.mutate({ postId: post.id, content }); }}>
              <Input maxLength={1500} value={commentDrafts[post.id] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="Agregar comentario..." />
              <Button type="submit" disabled={!commentDrafts[post.id]?.trim()} title="Publicar comentario"><Send /></Button>
            </form>
          </div>
        </Card>)}
        {!postsQuery.isLoading && !(postsQuery.data ?? []).length ? <EmptyState title="Aun no hay novedades" description="Publica el primer registro de trabajo del equipo." /> : null}
      </section>
    </div>}
  </main>;
}
