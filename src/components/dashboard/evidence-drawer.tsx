"use client";

import { type ReactNode } from "react";
import { Dialog } from "radix-ui";

export function EvidenceDrawer({
  titleId,
  onClose,
  children,
}: {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="detail-modal-backdrop" />
        <Dialog.Content className="detail-modal" aria-labelledby={titleId} aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Details</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
