import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <div className="dashboard">
        <DashboardShell>{children}</DashboardShell>
      </div>
    </div>
  );
}
