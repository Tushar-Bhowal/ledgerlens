"use client";

import Link from "next/link";
import { DataTable } from "@/components/ui/data-table";
import { collectionPriorities } from "@/features/finance/preview-selectors";
import { financePreview } from "@/features/finance/preview-data";
import { money } from "@/lib/demo-data";

export function ActionQueue() {
  const rows = financePreview.actions.map((row) => {
    const customer = row.kind === "Collection" ? collectionPriorities.find((item) => row.id === `COL-${item.id}`) : undefined;
    return {
      ...row,
      customer,
      amount: customer?.overdue ?? row.amount,
      next: customer ? "Follow up on the collection portion and send the disputed portion to its owner." : row.next,
    };
  }).sort((a, b) => Number(b.priority === "High") - Number(a.priority === "High")
    || (b.customer?.actionable ?? b.amount) - (a.customer?.actionable ?? a.amount)
    || a.id.localeCompare(b.id));
  return (
    <section className="panel finance-panel">
      <header className="finance-panel-heading"><div><h2>Prioritised next steps</h2><p>Collection follow-ups and supplier control reviews</p></div></header>
      <p className="footnote">High-priority controls and collection risks come first, then the collection portion or bill obligation. A party can have several obligations. The amounts are review scopes and cannot be summed as cash-release opportunities.</p>
      <DataTable label="Prioritised actions" rows={rows} getRowKey={(row) => row.id} columns={[
        { id: "rank", label: "Rank", cell: (row) => rows.findIndex((item) => item.id === row.id) + 1 },
        { id: "priority", label: "Priority", cell: (row) => <span className={row.priority === "High" ? "table-status overdue" : "table-status"}>{row.priority}</span> },
        { id: "party", label: "Party / action", cell: (row) => <span className="table-record-text"><strong>{row.party}</strong><small>{row.kind}</small></span> },
        { id: "amount", label: "Review scope", align: "right", cell: (row) => money(row.amount) },
        { id: "collection", label: "Collection portion", align: "right", cell: (row) => row.customer ? money(row.customer.actionable) : "Not applicable" },
        { id: "disputed", label: "Disputed portion", align: "right", cell: (row) => row.customer ? money(row.customer.disputed) : "See bill controls" },
        { id: "reason", label: "Reason", cell: (row) => row.reason },
        { id: "next", label: "Next step", cell: (row) => <div>{row.next}<br /><Link className="text-link" href={row.href}>Review {row.source}</Link></div> },
      ]}
        search={{ label: "Search actions", placeholder: "Search party or source", getText: (row) => `${row.party} ${row.source} ${row.reason}` }}
        filters={[
          { id: "kind", label: "Action type", allLabel: "All types", options: ["Collection", "Payment review"].map((value) => ({ value, label: value })), getValue: (row) => row.kind },
          { id: "priority", label: "Priority", allLabel: "All priorities", options: ["High", "Review", "Monitor"].map((value) => ({ value, label: value })), getValue: (row) => row.priority },
        ]} pageSize={8} />
    </section>
  );
}
