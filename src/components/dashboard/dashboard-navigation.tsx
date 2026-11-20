"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function DashboardNavigation() {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);

  if (openPath !== null && openPath !== pathname) setOpenPath(null);

  const open = openPath === pathname;
  const close = () => setOpenPath(null);

  return (
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
  );
}
