"use client";

import { useEffect, useState } from "react";
import { CircleAlert, RotateCcw, X } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { DataTableSkeleton } from "@/components/ui/loading-skeletons";
import { StateMessage } from "@/components/ui/state-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
    fetch(customerId ? `/api/finance/customers?customerId=${encodeURIComponent(customerId)}` : "/api/finance/customers", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load customers");
        return response.json() as Promise<{ rows: Customer[]; rejectedRows: number }>;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
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
      {customerId && rows !== null && !error && !selected && <p className="finance-validation" role="status">The requested customer was not found in the reporting scope. Choose a customer from the live table.</p>}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent
          className="sm:max-w-7xl w-[min(calc(100vw-2rem),80rem)] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden border border-border bg-card shadow-2xl rounded-2xl"
          showCloseButton={true}
        >
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border bg-card/60 backdrop-blur-xs pr-12">
                <div>
                  <span className="inline-block px-2.5 py-0.5 mb-1.5 text-[10px] font-semibold tracking-wider uppercase rounded-md bg-primary/10 text-primary border border-primary/20">
                    Customer Profile Review
                  </span>
                  <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
                    {selected.name}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-1">
                    Customer ID: <strong className="text-foreground font-mono">{selected.id}</strong>
                    {selected.group ? ` · Group: ${selected.group}` : ""}
                    {selected.region ? ` · Region: ${selected.region}` : ""}
                    {selected.priority ? (
                      <>
                        {" · Priority: "}
                        <span className={selected.priority === "High" ? "text-amber-500 font-medium" : "font-medium"}>
                          {selected.priority}
                        </span>
                      </>
                    ) : ""}
                  </DialogDescription>
                </div>
              </div>

              <div className="overflow-y-auto px-6 py-5 flex flex-col gap-5 min-h-0">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="flex flex-col gap-1 p-3 bg-background border border-border rounded-xl shadow-2xs">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Positive outstanding</span>
                    <span className="text-base font-semibold tabular-nums text-foreground">{amount(selected.outstanding)}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 bg-background border border-border rounded-xl shadow-2xs">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Overdue balance</span>
                    <span className="text-base font-semibold tabular-nums text-amber-500 dark:text-amber-400">{amount(selected.overdue)}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 bg-background border border-border rounded-xl shadow-2xs">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Collection portion</span>
                    <span className="text-base font-semibold tabular-nums text-foreground">{amount(selected.actionable)}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 bg-background border border-border rounded-xl shadow-2xs">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Disputed portion</span>
                    <span className="text-base font-semibold tabular-nums text-foreground">{amount(selected.disputed)}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 bg-background border border-border rounded-xl shadow-2xs">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Credit limit</span>
                    <span className="text-base font-semibold tabular-nums text-foreground">{amount(selected.limit)}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 bg-background border border-border rounded-xl shadow-2xs">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Settlement days</span>
                    <span className="text-base font-semibold tabular-nums text-foreground">
                      {selected.paymentDays === null ? "Unavailable" : `${Number(selected.paymentDays).toFixed(1)} days`}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-accent/40 border border-border text-xs leading-relaxed text-muted-foreground">
                  Historical credit limits are unavailable. The table below lists all live customer invoices, cash allocations, and signed adjustments for <strong className="text-foreground">{selected.name}</strong> as of 31 Dec 2025.
                </div>

                <div className="min-w-0">
                  <LiveDocuments key={selected.id} ledger="ar" partyId={selected.id} nested />
                </div>
              </div>

              <div className="flex items-center justify-end px-6 py-3 border-t border-border bg-card/60 backdrop-blur-xs">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected(null)}
                  className="cursor-pointer"
                >
                  <X className="size-4 mr-1.5" aria-hidden="true" />
                  Close profile
                </Button>
              </div>
            </>
          ) : (
            <div className="sr-only">
              <DialogTitle>Customer Profile Review</DialogTitle>
              <DialogDescription>Customer details</DialogDescription>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
