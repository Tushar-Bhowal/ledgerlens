"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { DataTableSkeleton } from "@/components/ui/loading-skeletons";
import { StateMessage } from "@/components/ui/state-message";
import { money } from "@/lib/demo-data";
import type { OpportunitiesResult } from "@/server/finance/opportunities";

type ActionItem = {
  id: string;
  kind: "Collection" | "Payment review";
  priority: "High" | "Review" | "Monitor";
  party: string;
  source: string;
  href: string;
  amount: number;
  actionable?: number;
  disputed?: number;
  reason: string;
  next: string;
};

export function ActionQueue() {
  const [liveOpp, setLiveOpp] = useState<OpportunitiesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/finance/opportunities", { signal: controller.signal, cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Action queue unavailable");
        return res.json() as Promise<OpportunitiesResult>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setLiveOpp(data);
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

  const collectionActions: ActionItem[] = (liveOpp?.opportunities ?? []).slice(0, 15).map((opp) => ({
    id: `COL-${opp.id}`,
    kind: "Collection",
    priority: opp.disputed > 0 || opp.overdue > 100000 ? "High" : "Review",
    party: opp.party,
    source: opp.number,
    href: `/receivables?invoice=${opp.id}`,
    amount: opp.overdue,
    actionable: opp.actionable,
    disputed: opp.disputed,
    reason: opp.disputed > 0 ? "Overdue balance with active dispute." : "Overdue receivable pending collection.",
    next: opp.step,
  }));

  const paymentActions: ActionItem[] = (liveOpp?.paymentReview ?? []).slice(0, 15).map((rev) => ({
    id: `PAY-${rev.id}`,
    kind: "Payment review",
    priority: rev.approvalWarnings.length > 0 || rev.hasHold || rev.criticality === "Critical" ? "High" : "Review",
    party: rev.vendorName,
    source: rev.number,
    href: `/payables?bill=${rev.id}`,
    amount: rev.outstanding,
    reason: rev.approvalWarnings.length > 0 ? `Related posted payment approval requires review: ${rev.approvalWarnings.map((p) => p.id).join(", ")}.` : rev.hasHold ? "Payment hold active on bill." : rev.hasDispute ? "Unresolved supplier dispute." : `${rev.criticality} supplier obligation.`,
    next: rev.eligible ? "Review payment terms and schedule disbursement." : "Resolve payment approval, hold or dispute controls before scheduling.",
  }));

  const rows: ActionItem[] = [...collectionActions, ...paymentActions].sort((a, b) =>
    Number(b.priority === "High") - Number(a.priority === "High")
    || ((b.actionable ?? b.amount) - (a.actionable ?? a.amount))
    || a.id.localeCompare(b.id)
  );

  return (
    <section className="panel finance-panel">
      <header className="finance-panel-heading">
        <div>
          <h2>Prioritised next steps</h2>
          <p>Collection follow-ups and supplier control reviews</p>
        </div>
      </header>
      <p className="footnote">High-priority controls and collection risks come first, then the collection portion or bill obligation. A party can have several obligations. The amounts are review scopes and cannot be summed as cash-release opportunities.</p>

      {loading && <DataTableSkeleton columns={6} rows={8} />}
      {error && !loading && (
        <StateMessage icon={CircleAlert} title="Action queue unavailable" description="Failed to load action items from database.">
          <button type="button" className="table-tool-button" onClick={() => { setError(false); setLoading(true); setAttempt((value) => value + 1); }}><RotateCcw size={16} aria-hidden="true" /> Try again</button>
        </StateMessage>
      )}

      {!loading && !error && (
        <DataTable
          label="Prioritised actions"
          rows={rows}
          getRowKey={(row) => row.id}
          columns={[
            { id: "rank", label: "Rank", cell: (row) => rows.findIndex((item) => item.id === row.id) + 1 },
            { id: "priority", label: "Priority", cell: (row) => <span className={row.priority === "High" ? "table-status overdue" : "table-status"}>{row.priority}</span> },
            { id: "party", label: "Party / action", cell: (row) => <span className="table-record-text"><strong>{row.party}</strong><small>{row.kind}</small></span> },
            { id: "amount", label: "Review scope", align: "right", cell: (row) => money(row.amount) },
            { id: "collection", label: "Collection portion", align: "right", cell: (row) => row.actionable !== undefined ? money(row.actionable) : "Not applicable" },
            { id: "disputed", label: "Disputed portion", align: "right", cell: (row) => row.disputed !== undefined ? money(row.disputed) : "See bill controls" },
            { id: "reason", label: "Reason", cell: (row) => row.reason },
            { id: "next", label: "Next step", cell: (row) => <div>{row.next}<br /><Link className="text-link" href={row.href}>Review {row.source}</Link></div> },
          ]}
          search={{ label: "Search actions", placeholder: "Search party or source", getText: (row) => `${row.party} ${row.source} ${row.reason}` }}
          filters={[
            { id: "kind", label: "Action type", allLabel: "All types", options: ["Collection", "Payment review"].map((value) => ({ value, label: value })), getValue: (row) => row.kind },
            { id: "priority", label: "Priority", allLabel: "All priorities", options: ["High", "Review", "Monitor"].map((value) => ({ value, label: value })), getValue: (row) => row.priority },
          ]}
          pageSize={8}
        />
      )}
    </section>
  );
}
