import { ClipboardList } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty">
      <ClipboardList />
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
