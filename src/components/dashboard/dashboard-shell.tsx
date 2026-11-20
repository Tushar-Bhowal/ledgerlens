"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { StaticViewContext } from "./view-mode";

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [isStaticView, setIsStaticView] = useState(true);

  if (openPath !== null && openPath !== pathname) setOpenPath(null);

  const open = openPath === pathname;
  const close = () => setOpenPath(null);

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(next) => setOpenPath(next ? pathname : null)}>
        <Topbar
          pathname={pathname}
          isStaticView={isStaticView}
          onViewChange={setIsStaticView}
          menu={
            <Dialog.Trigger asChild>
              <button type="button" className="dashboard-menu-button" aria-label="Open navigation">
                <Menu size={19} aria-hidden="true" />
              </button>
            </Dialog.Trigger>
          }
        />
        <Sidebar open={open} pathname={pathname} onNavigate={close} showSnapshot={isStaticView} />
      </Dialog.Root>
      <main className="dashboard-main">
        <StaticViewContext value={isStaticView}>{children}</StaticViewContext>
      </main>
    </>
  );
}
