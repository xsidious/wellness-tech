import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  lede,
  actions,
}: {
  kicker?: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="ws-head">
      <div className="ws-head-copy">
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h1>{title}</h1>
        {lede ? <p className="lede ws-lede">{lede}</p> : null}
      </div>
      {actions ? <div className="ws-head-actions">{actions}</div> : null}
    </header>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "accent" | "warn" | "ok";
}) {
  return (
    <div className={`ws-stat ws-stat-${tone}`}>
      <span className="ws-stat-label">{label}</span>
      <strong className="ws-stat-value">{value}</strong>
      {hint ? <span className="ws-stat-hint">{hint}</span> : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  flush,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className={`ws-card${flush ? " ws-card-flush" : ""}`}>
      {title || action || description ? (
        <div className="ws-card-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p className="muted">{description}</p> : null}
          </div>
          {action ? <div className="ws-card-action">{action}</div> : null}
        </div>
      ) : null}
      <div className="ws-card-body">{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="ws-empty">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "info";
}) {
  return <span className={`ws-badge ws-badge-${tone}`}>{children}</span>;
}

export function QuickLink({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Link href={href} className="ws-quick">
      <strong>{title}</strong>
      <span>{body}</span>
    </Link>
  );
}

export function statusTone(status: string): "neutral" | "ok" | "warn" | "danger" | "info" {
  const s = status.toLowerCase();
  if (["delivered", "paid", "active", "approved", "cleared", "shipped", "complete", "completed"].some((x) => s.includes(x))) {
    return "ok";
  }
  if (["due", "pending", "processing", "submitted", "awaiting", "review"].some((x) => s.includes(x))) {
    return "warn";
  }
  if (["failed", "cancelled", "canceled", "rejected", "hold", "error"].some((x) => s.includes(x))) {
    return "danger";
  }
  if (["rx", "fulfillment", "routed"].some((x) => s.includes(x))) {
    return "info";
  }
  return "neutral";
}
