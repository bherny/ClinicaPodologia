import type { ReactNode } from "react";

export function Card({
  title,
  action,
  children,
  className
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className ?? ""}`}>
      {(title || action) && (
        <header className="card__header">
          {title ? <h2 className="card__title">{title}</h2> : <span />}
          {action}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}
