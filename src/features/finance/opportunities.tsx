"use client";

import Link from "next/link";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { money } from "@/lib/demo-data";
import { financePreview } from "./preview-data";
import { opportunityTotals, overdueDocuments, totalAmount } from "./preview-selectors";

export function Opportunities() {
  return (
    <section className="panel finance-panel">
      <header className="finance-panel-heading"><div><h2>Collection opportunities</h2><p>Unique overdue invoices · 31 Dec 2025</p></div></header>
      <div className="stat-strip">
        <StatCard label="Actionable overdue" value={opportunityTotals.actionable} format="rupees" caption="After unresolved disputed portions" />
        <StatCard label="Disputed overdue" value={opportunityTotals.disputed} format="rupees" caption="Capped at each invoice’s open amount" attention />
        <StatCard label="Total overdue" value={opportunityTotals.overdue} format="rupees" caption="Actionable plus disputed" />
      </div>
      <p className="footnote">Each invoice appears once. These are reviewable balances, not guaranteed receipts. Open and Under Review disputes are excluded from the collection portion only where their dates and invoice links are consistent.</p>
      <DataTable label="Collection opportunities by invoice" rows={overdueDocuments} getRowKey={(row) => row.id}
        columns={[
          { id: "source", label: "Invoice", cell: (row) => <Link className="text-link" href={`/receivables?invoice=${row.id}`}>{row.number}</Link> },
          { id: "party", label: "Customer", cell: (row) => row.party },
          { id: "due", label: "Due date", cell: (row) => row.due },
          { id: "overdue", label: "Overdue", align: "right", cell: (row) => money(row.overdue) },
          { id: "disputed", label: "Disputed portion", align: "right", cell: (row) => money(row.disputed) },
          { id: "actionable", label: "Collection portion", align: "right", compare: (a, b) => a.actionable - b.actionable, cell: (row) => money(row.actionable) },
          { id: "step", label: "Next step", cell: (row) => row.disputed > 0 ? "Resolve the dispute; follow up on the undisputed balance." : "Confirm allocations and agree a collection date." },
        ]}
        search={{ label: "Search opportunities", placeholder: "Search customer or invoice", getText: (row) => `${row.party} ${row.id} ${row.number}` }}
        defaultSort={{ columnId: "actionable", direction: "descending" }} pageSize={8} />
      <h3>Unallocated receipts · {money(totalAmount(financePreview.unallocated.map((row) => row.amount)))}</h3>
      <p className="footnote">This cash has already been received. It is an allocation task and stays outside the collection opportunity total.</p>
      <DataTable label="Unallocated receipt review" rows={financePreview.unallocated} getRowKey={(row) => row.id} columns={[
        { id: "receipt", label: "Receipt", cell: (row) => <Link className="text-link" href={`/exceptions?issue=${row.id}`}>{row.id}</Link> },
        { id: "customer", label: "Customer", cell: (row) => financePreview.customers.find((item) => item.id === row.partyId)?.name ?? row.partyId },
        { id: "amount", label: "Unallocated", align: "right", cell: (row) => money(row.amount) },
      ]} pageSize={false} />
    </section>
  );
}
