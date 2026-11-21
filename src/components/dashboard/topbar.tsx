"use client";

import { CalendarDays, ChevronRight, Settings } from "lucide-react";
import { useState, type ReactNode } from "react";
import { dashboardNavigation } from "./navigation";
import { reportingDate } from "@/lib/demo-data";
import { AISettingsDialog } from "./ai-settings-dialog";

export function Topbar({ pathname, menu }: {
  pathname: string;
  menu: ReactNode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
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
            <button
              type="button"
              className="inline-flex items-center gap-1.5 p-1 pr-2.5 text-muted-foreground hover:text-foreground bg-secondary/60 hover:bg-secondary border border-border hover:border-primary/50 rounded-full transition-colors cursor-pointer shadow-xs"
              onClick={() => setSettingsOpen(true)}
              aria-label="AI & Model Settings"
              title="Configure AI API Keys & Models (Tushar Bhowal)"
            >
              <span className="grid place-items-center w-5 h-5 rounded-full text-[10px] font-bold text-white bg-gradient-to-br from-blue-500 to-indigo-600" aria-hidden="true">
                TB
              </span>
              <Settings size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <AISettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
