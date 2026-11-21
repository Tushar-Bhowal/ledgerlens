"use client";

import { useState } from "react";
import { ReceiptText, Settings, X } from "lucide-react";
import { AnimatePresence, domAnimation, LazyMotion, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { dashboardNavigation } from "./navigation";
import { AISettingsDialog } from "./ai-settings-dialog";

export function Sidebar({ open, pathname, onNavigate }: {
  open: boolean;
  pathname: string;
  onNavigate: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const slide = { x: reduceMotion ? 0 : "-100%" };
  const transition = { duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <>
      <LazyMotion features={domAnimation} strict>
        <AnimatePresence>
          {open && (
            <Dialog.Portal key="dashboard-sidebar" forceMount>
              <Dialog.Overlay asChild>
                <m.div className="sidebar-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.16 }} />
              </Dialog.Overlay>
              <Dialog.Content asChild>
                <m.aside className="sidebar" initial={slide} animate={{ x: 0 }} exit={slide} transition={transition}>
                  <Dialog.Title className="sr-only">Dashboard navigation</Dialog.Title>
                  <Dialog.Description className="sr-only">Choose a LedgerLens page.</Dialog.Description>
                  <header className="sidebar-header">
                    <Link className="brand" href="/" onClick={onNavigate}>
                      <span className="brand-mark"><ReceiptText size={18} aria-hidden="true" /></span>
                      <span><strong>LedgerLens</strong><small>Working capital</small></span>
                    </Link>
                    <Dialog.Close asChild>
                      <button type="button" className="dashboard-menu-button" aria-label="Close navigation">
                        <X size={19} aria-hidden="true" />
                      </button>
                    </Dialog.Close>
                  </header>
                  <nav aria-label="Main navigation" className="navigation">
                    {dashboardNavigation.map(({ label, href, icon: Icon }) => (
                      <Link key={href} href={href} className={pathname === href ? "nav-item active" : "nav-item"} aria-current={pathname === href ? "page" : undefined} onClick={onNavigate}>
                        <Icon size={16} aria-hidden="true" />
                        <span>{label}</span>
                      </Link>
                    ))}
                  </nav>

                  <div className="mt-auto flex flex-col pb-4">
                    <div className="flex items-center justify-between gap-2.5 mx-3.5 mt-3 p-2.5 rounded-xl bg-secondary/50 border border-border shadow-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="grid place-items-center shrink-0 w-8 h-8 rounded-full text-xs font-semibold text-white bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xs" aria-hidden="true">
                          TB
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-foreground truncate">Tushar Bhowal</span>
                          <span className="text-[11px] text-muted-foreground truncate">Finance Operations Lead</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="grid place-items-center shrink-0 w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors cursor-pointer"
                        aria-label="AI & Model Settings"
                        title="AI & Model Settings"
                        onClick={() => setSettingsOpen(true)}
                      >
                        <Settings size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </m.aside>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </LazyMotion>

      <AISettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
