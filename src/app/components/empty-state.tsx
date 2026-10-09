import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A calm placeholder for a list with nothing in it yet, or nothing that matches the filters. */
export function EmptyState({
  action,
  children,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  children?: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        <Icon size={22} strokeWidth={1.6} />
      </span>
      <p className="empty-state-title">{title}</p>
      {children ? <p className="empty-state-text">{children}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
