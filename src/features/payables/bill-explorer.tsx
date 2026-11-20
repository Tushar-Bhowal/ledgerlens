"use client";

import { useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { DocumentEvidence } from "@/features/finance/document-evidence";
import { financePreview } from "@/features/finance/preview-data";
import { money } from "@/lib/demo-data";

export function BillExplorer({ billId, priorities = false, vendorId }: { billId?: string; priorities?: boolean; vendorId?: string }) {
  const [selected, setSelected] = useState(() => financePreview.bills.find((row) => row.id === billId) ?? null);
  const rows = financePreview.bills.filter((row) => (!priorities || row.outstanding > 0) && (!vendorId || row.partyId === vendorId));
  return (
    <>
      <section className="panel finance-panel">
        <header className="finance-panel-heading"><div><h2>{priorities ? "Supplier payment review" : "Supplier bills and settlements"}</h2><p>Posted payments settle valid allocations even when approval is pending.</p></div></header>
        {priorities && <p className="footnote">Eligible obligations appear before blocked items, ordered by overdue status, criticality, due date and balance. “Eligible for review” is a scheduling candidate and requires a human decision.</p>}
        <DataTable label="Supplier bills" rows={rows} getRowKey={(row) => row.id} getRowLabel={(row) => row.number}
          rowActions={(row) => [{ label: "View evidence", onSelect: () => setSelected(row) }]}
          columns={[
            { id: "bill", label: "Bill", cell: (row) => <button className="invoice-record" type="button" onClick={() => setSelected(row)}><span className="table-record-text"><strong>{row.number}</strong><small>{row.party}</small></span></button> },
            { id: "due", label: "Due date", compare: (a, b) => a.due.localeCompare(b.due), cell: (row) => row.due },
            { id: "criticality", label: "Criticality", cell: (row) => row.criticality },
            { id: "terms", label: "Terms", cell: (row) => `${row.termsDays} days${row.msme ? " · MSME" : ""}` },
            { id: "status", label: "Review status", cell: (row) => <span className={row.eligibility === "Review" ? "table-status overdue" : "table-status"}>{row.eligibility}</span> },
            { id: "outstanding", label: "Outstanding", align: "right", compare: (a, b) => a.outstanding - b.outstanding, cell: (row) => money(row.outstanding) },
            { id: "controls", label: "Controls", cell: (row) => row.controls.join(" · ") || "No flagged control in source" },
          ]}
          search={{ label: "Search supplier bills", placeholder: "Search supplier or bill", getText: (row) => `${row.number} ${row.party} ${row.id}` }}
          filters={[
            { id: "status", label: "Review status", allLabel: "All statuses", options: ["Review", "Eligible for review", "Settled"].map((value) => ({ value, label: value })), getValue: (row) => row.eligibility },
            { id: "control", label: "Control", allLabel: "All control states", options: [{ value: "flagged", label: "Flagged" }, { value: "clear", label: "No flag" }], getValue: (row) => row.controls.length ? "flagged" : "clear" },
          ]} pageSize={8} />
      </section>
      {selected && <DocumentEvidence ledger="ap" document={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
