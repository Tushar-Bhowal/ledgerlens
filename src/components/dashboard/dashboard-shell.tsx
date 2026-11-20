"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { LiveSummaryProvider } from "./live-summary";
import { LiveHistoryProvider } from "./live-history";

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);

  if (openPath !== null && openPath !== pathname) setOpenPath(null);

  const open = openPath === pathname;
  const close = () => setOpenPath(null);

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(next) => setOpenPath(next ? pathname : null)}>
        <Topbar
          pathname={pathname}
          menu={
            <Dialog.Trigger asChild>
              <button type="button" className="dashboard-menu-button" aria-label="Open navigation">
                <Menu size={19} aria-hidden="true" />
              </button>
            </Dialog.Trigger>
          }
        />
        <Sidebar open={open} pathname={pathname} onNavigate={close} />
      </Dialog.Root>
      <main className="dashboard-main">
        <LiveSummaryProvider active={true}>
          <LiveHistoryProvider active={true}>
            {children}
          </LiveHistoryProvider>
        </LiveSummaryProvider>
      </main>
    </>
  );
}
