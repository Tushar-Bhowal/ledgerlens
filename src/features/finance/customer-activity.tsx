"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import type { CustomerActivity, CustomerActivityEvent } from "@/server/finance/customer-activity";
import { formatLiveAmount } from "./live-analysis-format";

export function CustomerActivityHistory({ customerId }: { customerId: string }) {
  const [data, setData] = useState<CustomerActivity | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/finance/customers?customerId=${encodeURIComponent(customerId)}&activity=true`, { signal: controller.signal, cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Activity unavailable"); return response.json() as Promise<CustomerActivity>; })
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [customerId, attempt]);
  if (error) return <div role="status">Customer activity could not load. <button type="button" className="text-link" onClick={() => { setError(false); setAttempt((n) => n + 1); }}>Try again</button></div>;
  if (!data) return <p role="status">Loading customer activity…</p>;
  return <section>
    <h3>Receipts, disputes and follow-up history</h3>
    <p className="footnote">Source activity through {data.asOf}. Receipt amounts are cash headers, not additional invoice settlement. Statuses reflect the supplied snapshot; missing historical status changes cannot be reconstructed.</p>
    <DataTable<CustomerActivityEvent> label="Customer source activity" rows={data.events} getRowKey={(row) => row.id} pageSize={8} columns={[
      { id: "event", label: "Record", cell: (row) => `${row.kind} · ${row.id}` },
      { id: "date", label: "Date", cell: (row) => row.date ?? "Unavailable" },
      { id: "amount", label: "Source amount", cell: (row) => formatLiveAmount(row.amount) },
      { id: "status", label: "Status / detail", cell: (row) => <>{row.status ?? "Unknown"}<small className="block">{row.detail}</small>{row.warning && <strong className="block">{row.warning}</strong>}</> },
      { id: "source", label: "CSV source", cell: (row) => `${row.sourceFilename} · record ${row.sourceRecordNumber}` },
      { id: "invoice", label: "Invoice evidence", cell: (row) => <>{row.invoiceId && <Link className="text-link" href={`/receivables?invoice=${row.invoiceId}`}>{row.invoiceId}</Link>}{row.allocations.map((allocation, index) => <div key={`${allocation.invoiceId}-${index}`}><Link className="text-link" href={`/receivables?invoice=${allocation.invoiceId}`}>{allocation.invoiceId}</Link> · {formatLiveAmount(allocation.amount)} · {allocation.date ?? "Date unavailable"} · {allocation.status ?? "Unknown"}<small className="block">{allocation.sourceFilename} · record {allocation.sourceRecordNumber}</small></div>)}</> },
    ]} />
  </section>;
}
