import type { ReactNode } from "react";
import { DashboardNavigation } from "@/components/dashboard/dashboard-navigation";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <div className="dashboard">
        <DashboardNavigation />
        <main className="dashboard-main">{children}</main>
      </div>
    </div>
  );
}
