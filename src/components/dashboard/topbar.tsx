import { CalendarDays, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { dashboardNavigation } from "./navigation";
import { reportingDate } from "@/lib/demo-data";

export function Topbar({ pathname, menu }: {
  pathname: string;
  menu: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="topbar-content">
        <div className="topbar-start">
          {menu}
          <div className="breadcrumb">
            <span>Dashboard</span>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{dashboardNavigation.find((item) => item.href === pathname)?.label}</strong>
          </div>
        </div>
        <div className="topbar-end">
          <time className="snapshot" dateTime={reportingDate}>
            <CalendarDays size={15} aria-hidden="true" /> As of 31 Dec 2025
          </time>
        </div>
      </div>
    </header>
  );
}
