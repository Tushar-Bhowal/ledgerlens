"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useStaticView } from "./view-mode";

export function EvidenceDrawer({ titleId, onClose, children }: { titleId: string; onClose: () => void; children: ReactNode }) {
  const isStaticView = useStaticView();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, [isStaticView]);
  if (!isStaticView) return null;
  return <dialog ref={dialog} className="detail-modal" aria-labelledby={titleId} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>{children}</dialog>;
}
