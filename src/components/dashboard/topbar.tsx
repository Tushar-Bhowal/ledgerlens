import { CalendarDays, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { dashboardNavigation } from "./navigation";
import { reportingDate } from "@/lib/demo-data";

export function Topbar({ pathname, menu, isStaticView, onViewChange }: {
  pathname: string;
  menu: ReactNode;
  isStaticView: boolean;
  onViewChange: (isStaticView: boolean) => void;
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
          {isStaticView ? (
            <time className="snapshot" dateTime={reportingDate}>
              <CalendarDays size={15} aria-hidden="true" /> As of 31 Dec 2025
            </time>
          ) : (
            <span className="snapshot"><CalendarDays size={15} aria-hidden="true" /> As of —</span>
          )}
          <label className="preview-state-select">
            <span className="sr-only">Dashboard data view</span>
            <select value={isStaticView ? "static" : "dynamic"} onChange={(event) => onViewChange(event.target.value === "static")}>
              <option value="static">Static View</option>
              <option value="dynamic">Dynamic View</option>
            </select>
          </label>
        </div>
      </div>
    </header>
  );
}
