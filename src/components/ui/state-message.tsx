import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function StateMessage({ icon: Icon, title, description, children, heading: Heading = "h2", compact = false, role = "status" }: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
  heading?: "h1" | "h2" | "h3";
  compact?: boolean;
  role?: "status" | "alert";
}) {
  return (
    <div className={compact ? "state-message state-message-compact" : "state-message"}>
      <span className="state-message-icon" aria-hidden="true"><Icon size={24} /></span>
      <div className="state-message-copy" role={role}>
        <Heading>{title}</Heading>
        <p>{description}</p>
      </div>
      {children && <div className="state-message-actions">{children}</div>}
    </div>
  );
}
