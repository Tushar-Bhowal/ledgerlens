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
  const [open, setOpen] = useState(false);
  const [openPathname, setOpenPathname] = useState<string | null>(null);

  const isOpen = open && openPathname === pathname;
  const close = () => setOpen(false);

  return (
    <>
      <Dialog.Root
        open={isOpen}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setOpenPathname(pathname);
        }}
      >
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
        <Sidebar open={isOpen} pathname={pathname} onNavigate={close} />
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
