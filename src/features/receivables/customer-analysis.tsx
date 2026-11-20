"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { EvidenceDrawer } from "@/components/dashboard/evidence-drawer";
import { useStaticView } from "@/components/dashboard/view-mode";
import { collectionPriorities } from "@/features/finance/preview-selectors";
import { financePreview, percent } from "@/features/finance/preview-data";
import { money } from "@/lib/demo-data";

export function CustomerAnalysis({ customerId }: { customerId?: string }) {
  const isStaticView = useStaticView();
  const [selected, setSelected] = useState(() => financePreview.customers.find((row) => row.id === customerId) ?? null);
  const customers = collectionPriorities;
  const documents = selected ? financePreview.invoices.filter((row) => row.partyId === selected.id && row.outstanding > 0).sort((a, b) => a.due.localeCompare(b.due)) : [];

  return (
    <>
      <section className="panel finance-panel">
        <header className="finance-panel-heading"><div><h2>Customer collection priorities</h2><p>Past-due exposure, current limits and source follow-ups{isStaticView && " · 31 Dec 2025"}</p></div></header>
        <p className="footnote">High priority means over-90-day overdue exposure, a breached current limit, or a valid broken promise. Within the group, actionable overdue and oldest due date determine order. Resolve disputes before chasing the disputed portion.</p>
        <DataTable label="Customer priorities" rows={customers} getRowKey={(row) => row.id} getRowLabel={(row) => row.name}
          rowActions={(row) => [{ label: "Review customer", onSelect: () => setSelected(row) }]}
          columns={[
            { id: "rank", label: "Rank", cell: (row) => customers.findIndex((item) => item.id === row.id) + 1 },
            { id: "customer", label: "Customer", cell: (row) => <button type="button" className="text-link" onClick={() => setSelected(row)}>{row.name}<span className="sr-only"> · Review profile</span></button> },
            { id: "risk", label: "Priority", cell: (row) => <span className={row.risk === "High" ? "table-status overdue" : "table-status"}>{row.risk}</span> },
            { id: "overdue", label: "Overdue", align: "right", compare: (a, b) => a.overdue - b.overdue, cell: (row) => money(row.overdue) },
            { id: "actionable", label: "Collection portion", align: "right", cell: (row) => money(row.actionable) },
            { id: "disputed", label: "Disputed portion", align: "right", cell: (row) => money(row.disputed) },
            { id: "oldest", label: "Oldest overdue", cell: (row) => `${row.oldest} days` },
            { id: "limit", label: "Limit utilisation", cell: (row) => percent(row.utilisation) },
            { id: "reason", label: "Observed signals", cell: (row) => row.reasons.join(" · ") || "Monitor payment history" },
          ]}
          search={{ label: "Search customers", placeholder: "Search customer or group", getText: (row) => `${row.name} ${row.id} ${row.group}` }}
          filters={[
            { id: "priority", label: "Priority", allLabel: "All priorities", options: ["High", "Review", "Monitor"].map((value) => ({ value, label: value })), getValue: (row) => row.risk },
            { id: "region", label: "Region", allLabel: "All regions", options: isStaticView ? [...new Set(customers.map((row) => row.region))].map((value) => ({ value, label: value })) : [], getValue: (row) => row.region },
          ]} pageSize={8} />
      </section>
      {selected && (
        <EvidenceDrawer titleId="customer-title" onClose={() => setSelected(null)}>
          <div className="modal-header"><div><span className="mini-label">CUSTOMER PROFILE</span><h2 id="customer-title">{selected.name}</h2><p>{selected.id} · {selected.group}</p></div><button type="button" aria-label="Close customer profile" onClick={(event) => event.currentTarget.closest("dialog")?.close()}><X size={20} /></button></div>
          <dl className="detail-list">
            <div><dt>Positive outstanding</dt><dd>{money(selected.outstanding)}</dd></div>
            <div><dt>Overdue</dt><dd>{money(selected.overdue)}</dd></div>
            <div><dt>Current credit limit</dt><dd>{money(selected.limit)}</dd></div>
            <div><dt>Utilisation</dt><dd>{percent(selected.utilisation)}</dd></div>
            <div><dt>Credit days in master</dt><dd>{selected.termsDays}</dd></div>
            <div><dt>Stated payment terms</dt><dd>{selected.terms}</dd></div>
            <div><dt>Actual settlement days</dt><dd>{selected.paymentDays === null ? "Unavailable" : selected.paymentDays.toFixed(1)}</dd></div>
            <div><dt>Latest invoice</dt><dd>{selected.lastInvoice || "Unavailable"}</dd></div>
          </dl>
          <h3>Why this customer needs review</h3>
          <ul className="finance-reasons">{selected.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          {selected.terms !== `Net ${selected.termsDays}` && <p className="finance-validation">Credit-day fields disagree. Document due dates govern ageing.</p>}
          <h3>Outstanding invoices</h3>
          {documents.map((row) => <Link className="allocation evidence-text-link" key={row.id} href={`/receivables?invoice=${row.id}`}>{row.number} · {money(row.outstanding)}<p>Due {row.due} · {row.disputes.length ? "Dispute linked" : "Open balance"}</p></Link>)}
          <h3>Follow-up history</h3>
          {selected.followups.length ? selected.followups.map((item) => <div className="allocation" key={item.id}>{item.id} · {item.status}<p>{item.date} · Owner {item.owner}</p><p>Promise {item.promise} · {money(item.amount)}</p>{!item.chronologyValid && <p>Source date precedes invoice. Excluded from escalation.</p>}</div>) : <p className="footnote">No supplied follow-up for this customer.</p>}
          <p className="footnote">Current credit limits cannot establish historical breaches. Risk inputs are transparent preview rules; the supplied risk-segment label is not used as the decision.</p>
        </EvidenceDrawer>
      )}
    </>
  );
}
