"use client";

import { useEffect, useState } from "react";
import { CircleAlert, RotateCcw, X } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { DataTableSkeleton } from "@/components/ui/loading-skeletons";
import { StateMessage } from "@/components/ui/state-message";
import { LiveDocuments } from "./live-documents";

type Customer = {
  rank: number;
  id: string;
  name: string;
  group: string | null;
  region: string | null;
  overdue: string | null;
  disputed: string | null;
  actionable: string | null;
  oldestDays: number;
  limit: string | null;
  outstanding: string | null;
  paymentDays: string | null;
  priority: string;
  reasons: string[];
};

function amount(value: string | null) {
  if (value === null) return "Unavailable";
  const [whole, fractional = "00"] = value.split(".");
  const sign = whole.startsWith("-") ? "−" : "";
  const digits = whole.replace(/^-/, "");
  const tail = digits.slice(-3);
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${sign}₹${head ? `${head},` : ""}${tail}.${fractional.padEnd(2, "0")}`;
}

export function LiveCustomers({ customerId }: { customerId?: string }) {
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [rejectedRows, setRejectedRows] = useState(0);

  useEffect(() => {
    // This endpoint returns ranked customers calculated from the same balances as the invoice table.
    const controller = new AbortController();
    fetch("/api/finance/customers", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load customers");
        return response.json() as Promise<{ rows: Customer[]; rejectedRows: number }>;
      })
      .then((result) => {
        setRows(result.rows);
        setRejectedRows(result.rejectedRows);
        setSelected(result.rows.find((row) => row.id === customerId) ?? null);
        setError(false);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt, customerId]);

  return (
    <section className="panel finance-panel">
      <header className="finance-panel-heading"><div><h2>Customer collection priorities</h2><p>Live records · 31 Dec 2025</p></div></header>
      <p className="footnote">Priority considers overdue age, credit limit and valid broken promises. Disputed portions are capped at the open invoice balance.</p>
      {rejectedRows > 0 && <p className="finance-validation" role="status">The source import rejected {rejectedRows} records. Customer figures may be incomplete.</p>}
      {error ? (
        <StateMessage icon={CircleAlert} title="Customers couldn’t load" description="Check the connection and try again.">
          <button className="table-tool-button" type="button" onClick={() => { setError(false); setRows(null); setAttempt((value) => value + 1); }}><RotateCcw size={16} aria-hidden="true" /> Try again</button>
        </StateMessage>
      ) : rows === null ? (
        <>
          <span className="sr-only" role="status">Loading customer priorities…</span>
          <DataTableSkeleton columns={10} rows={8} />
        </>
      ) : (
        <DataTable label="Customer priorities" rows={rows} getRowKey={(row) => row.id}
          getRowLabel={(row) => `${row.name}, ${row.id}`}
          rowActions={(row) => [{ label: "Review customer", onSelect: () => setSelected(row) }]}
          columns={[
            { id: "rank", label: "Rank", cell: (row) => row.rank },
            { id: "customer", label: "Customer", cell: (row) => <button type="button" className="text-link" onClick={() => setSelected(row)}>{row.name}</button> },
            { id: "priority", label: "Priority", cell: (row) => <span className={row.priority === "High" ? "table-status overdue" : "table-status"}>{row.priority}</span> },
            { id: "overdue", label: "Overdue", align: "right", cell: (row) => amount(row.overdue) },
            { id: "actionable", label: "Collection portion", align: "right", cell: (row) => amount(row.actionable) },
            { id: "disputed", label: "Disputed portion", align: "right", cell: (row) => amount(row.disputed) },
            { id: "oldest", label: "Oldest overdue", cell: (row) => `${row.oldestDays} days` },
            { id: "limit", label: "Limit utilisation", cell: (row) => row.outstanding === null || row.limit === null || Number(row.limit) <= 0 ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 }).format(Number(row.outstanding) / Number(row.limit)) },
            { id: "paymentDays", label: "Settlement days", cell: (row) => row.paymentDays === null ? "Unavailable" : `${Number(row.paymentDays).toFixed(1)} days` },
            { id: "reasons", label: "Observed signals", cell: (row) => row.reasons.join(" · ") || "Review overdue balance" },
          ]}
          search={{ label: "Search customers", placeholder: "Search customer or group", getText: (row) => `${row.name} ${row.id} ${row.group ?? ""}` }}
          filters={[
            { id: "priority", label: "Priority", allLabel: "All priorities", options: ["High", "Review", "Incomplete"].map((value) => ({ value, label: value })), getValue: (row) => row.priority },
            { id: "region", label: "Region", allLabel: "All regions", options: [...new Set(rows.flatMap((row) => row.region ? [row.region] : []))].map((value) => ({ value, label: value })), getValue: (row) => row.region ?? "" },
          ]}
          pageSize={8} />
      )}
      {selected && (
        <div className="customer-review-card" role="region" aria-label={`${selected.name} profile review`}>
          <div className="customer-review-header">
            <div>
              <span className="mini-label">CUSTOMER PROFILE REVIEW</span>
              <h3 className="customer-review-title">{selected.name}</h3>
              <p className="customer-review-subtitle">
                ID: <strong>{selected.id}</strong>
                {selected.group ? ` · Group: ${selected.group}` : ""}
                {selected.region ? ` · Region: ${selected.region}` : ""}
              </p>
            </div>
            <button
              type="button"
              className="table-tool-button close-profile-button"
              onClick={() => setSelected(null)}
              aria-label="Close customer review"
            >
              <X size={15} aria-hidden="true" />
              Close profile
            </button>
          </div>

          <div className="customer-metrics-grid">
            <div className="customer-metric-card">
              <span className="metric-label">Positive outstanding</span>
              <span className="metric-value">{amount(selected.outstanding)}</span>
            </div>
            <div className="customer-metric-card">
              <span className="metric-label">Overdue balance</span>
              <span className="metric-value overdue">{amount(selected.overdue)}</span>
            </div>
            <div className="customer-metric-card">
              <span className="metric-label">Collection portion</span>
              <span className="metric-value">{amount(selected.actionable)}</span>
            </div>
            <div className="customer-metric-card">
              <span className="metric-label">Disputed portion</span>
              <span className="metric-value">{amount(selected.disputed)}</span>
            </div>
            <div className="customer-metric-card">
              <span className="metric-label">Credit limit</span>
              <span className="metric-value">{amount(selected.limit)}</span>
            </div>
            <div className="customer-metric-card">
              <span className="metric-label">Settlement days</span>
              <span className="metric-value">
                {selected.paymentDays === null ? "Unavailable" : `${Number(selected.paymentDays).toFixed(1)} days`}
              </span>
            </div>
          </div>

          <div className="customer-review-notice">
            <p className="footnote">
              Historical credit limits are unavailable. The table below lists all live customer invoices, cash allocations, and signed adjustments for <strong>{selected.name}</strong> as of 31 Dec 2025.
            </p>
          </div>

          <div className="customer-invoices-container">
            <LiveDocuments key={selected.id} ledger="ar" partyId={selected.id} nested />
          </div>

          <div className="customer-review-footer">
            <button
              type="button"
              className="table-tool-button close-profile-button"
              onClick={() => setSelected(null)}
            >
              <X size={15} aria-hidden="true" />
              Close profile
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
