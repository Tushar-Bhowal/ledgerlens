"use client";

import { LiveDocuments } from "@/features/finance/live-documents";

export function InvoiceExplorer({ invoiceId, compact = false, customerId }: { invoiceId?: string; compact?: boolean; customerId?: string }) {
  return <LiveDocuments ledger="ar" compact={compact} initialId={invoiceId} partyId={customerId} />;
}
