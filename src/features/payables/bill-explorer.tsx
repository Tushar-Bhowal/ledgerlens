"use client";

import { useEffect, useState } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { DataTableSkeleton } from "@/components/ui/loading-skeletons";
import { StateMessage } from "@/components/ui/state-message";
import { LiveDocuments } from "@/features/finance/live-documents";
import { money } from "@/lib/demo-data";
import type { BillPaymentReview, OpportunitiesResult } from "@/server/finance/opportunities";

export function BillExplorer({ billId, priorities = false, vendorId }: { billId?: string; priorities?: boolean; vendorId?: string }) {
  if (priorities) {
    return <LiveSupplierPaymentReview vendorId={vendorId} />;
  }
  return <LiveDocuments ledger="ap" initialId={billId} partyId={vendorId} />;
}

function LiveSupplierPaymentReview({ vendorId }: { vendorId?: string }) {
  const [data, setData] = useState<OpportunitiesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/finance/opportunities", { signal: controller.signal, cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Opportunities unavailable");
        return res.json() as Promise<OpportunitiesResult>;
      })
      .then((resData) => {
        if (controller.signal.aborted) return;
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [attempt]);

  const allReviews: BillPaymentReview[] = data?.paymentReview ?? [];
  const rows = vendorId ? allReviews.filter((r) => r.vendorId === vendorId) : allReviews;

  return (
    <section className="panel finance-panel">
      <header className="finance-panel-heading">
        <div>
          <h2>Supplier payment review</h2>
          <p>Posted obligations ranked by due date, criticality, terms, and source MSME status.</p>
        </div>
      </header>
      <p className="footnote">
        Eligible obligations appear before blocked items. “Eligible for review” is a scheduling candidate and requires human approval. No automated disbursements are initiated.
      </p>

      {loading && <DataTableSkeleton columns={7} rows={8} />}
      {error && !loading && (
        <StateMessage icon={CircleAlert} title="Payment review unavailable" description="Failed to load supplier payment priorities from database.">
          <button type="button" className="table-tool-button" onClick={() => { setError(false); setLoading(true); setAttempt((value) => value + 1); }}>
            <RotateCcw size={16} aria-hidden="true" /> Try again
          </button>
        </StateMessage>
      )}

      {!loading && !error && (
        <DataTable
          label="Supplier payment review"
          rows={rows}
          getRowKey={(row) => row.id}
          getRowLabel={(row) => row.number}
          columns={[
            { id: "bill", label: "Bill", cell: (row) => <span className="invoice-record"><span className="table-record-text"><strong>{row.number}</strong><small>{row.vendorName}</small></span></span> },
            { id: "due", label: "Due date", compare: (a, b) => a.due.localeCompare(b.due), cell: (row) => row.due },
            { id: "criticality", label: "Criticality", cell: (row) => row.criticality },
            { id: "terms", label: "Terms", cell: (row) => `${row.termsDays === null ? "Unavailable" : `${row.termsDays} days`}${row.msme ? " · MSME" : ""}` },
            { id: "status", label: "Review status", cell: (row) => <span className={row.eligible ? "table-status current" : "table-status overdue"}>{row.eligible ? "Eligible for review" : "Blocked by controls"}</span> },
            { id: "outstanding", label: "Outstanding", align: "right", compare: (a, b) => a.outstanding - b.outstanding, cell: (row) => money(row.outstanding) },
            { id: "controls", label: "Controls", cell: (row) => row.hasHold ? "Payment hold active" : row.hasDispute ? "Commercial dispute" : "Clear" },
          ]}
          search={{ label: "Search supplier bills", placeholder: "Search supplier or bill", getText: (row) => `${row.number} ${row.vendorName} ${row.id}` }}
          filters={[
            { id: "status", label: "Review status", allLabel: "All statuses", options: [{ value: "Eligible for review", label: "Eligible for review" }, { value: "Blocked by controls", label: "Blocked by controls" }], getValue: (row) => row.eligible ? "Eligible for review" : "Blocked by controls" },
            { id: "criticality", label: "Criticality", allLabel: "All criticality", options: [{ value: "Critical", label: "Critical" }, { value: "Standard", label: "Standard" }], getValue: (row) => row.criticality },
          ]}
          pageSize={8}
        />
      )}
    </section>
  );
}
