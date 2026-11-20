"use client";

import { ReceiptText, X } from "lucide-react";
import { AnimatePresence, domAnimation, LazyMotion, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { dashboardNavigation } from "./navigation";

export function Sidebar({ open, pathname, onNavigate }: { open: boolean; pathname: string; onNavigate: () => void }) {
  const reduceMotion = useReducedMotion();
  const slide = { x: reduceMotion ? 0 : "-100%" };
  const transition = { duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] as const };

  return (
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
                <div className="source-note"><span>Starter dataset</span><span>INR</span></div>
              </m.aside>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
