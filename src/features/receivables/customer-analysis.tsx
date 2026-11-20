"use client";

import { LiveCustomers } from "@/features/finance/live-customers";

export function CustomerAnalysis({ customerId }: { customerId?: string }) {
  return <LiveCustomers customerId={customerId} />;
}
