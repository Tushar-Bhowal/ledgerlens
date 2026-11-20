"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { EvidenceDrawer } from "@/components/dashboard/evidence-drawer";
import { financePreview } from "@/features/finance/preview-data";
import { money } from "@/lib/demo-data";

export function ExceptionExplorer({ issueId }: { issueId?: string }) {
  const [selected, setSelected] = useState(() => (financePreview.issues.find((row) => row.id === issueId) ?? financePreview.issues.find((row) => row.evidence.includes(issueId ?? ""))) ?? null);
  const issues = financePreview.issues;
  return (
    <>
      <section className="panel finance-panel">
        <header className="finance-panel-heading"><div><h2>Investigation register</h2><p>Source-derived flags · High severity first, then supported exposure</p></div></header>
        <p className="footnote">Rows can flag the same document for different reasons. Their amounts must not be added together. Undetermined exposure stays unavailable.</p>
        <DataTable label="Investigation register" rows={issues} getRowKey={(row) => row.id} getRowLabel={(row) => row.id}
          rowActions={(row) => [{ label: "Investigate", onSelect: () => setSelected(row) }]}
          columns={[
            { id: "issue", label: "Issue", cell: (row) => <button className="invoice-record" type="button" onClick={() => setSelected(row)}><span className="table-record-text"><strong>{row.kind}</strong><small>{row.id}</small></span></button> },
            { id: "severity", label: "Severity", cell: (row) => <span className={row.severity === "High" ? "table-status overdue" : "table-status"}>{row.severity}</span> },
            { id: "status", label: "Source state", cell: (row) => row.status },
            { id: "party", label: "Party", cell: (row) => row.party },
            { id: "exposure", label: "Flagged amount", align: "right", cell: (row) => row.exposure === null ? "Undetermined" : money(row.exposure) },
            { id: "reason", label: "Possible reason", cell: (row) => row.reason },
          ]}
          search={{ label: "Search investigations", placeholder: "Search party, source or reason", getText: (row) => `${row.party} ${row.id} ${row.evidence.join(" ")} ${row.reason}` }}
          filters={[
            { id: "kind", label: "Issue type", allLabel: "All types", options: [...new Set(issues.map((row) => row.kind))].map((value) => ({ value, label: value })), getValue: (row) => row.kind },
            { id: "severity", label: "Severity", allLabel: "All severities", options: ["High", "Review", "Info"].map((value) => ({ value, label: value })), getValue: (row) => row.severity },
          ]} pageSize={8} />
      </section>
      {selected && (
        <EvidenceDrawer titleId="investigation-title" onClose={() => setSelected(null)}>
          <div className="modal-header"><div><span className="mini-label">SOURCE INVESTIGATION</span><h2 id="investigation-title">{selected.kind}</h2><p>{selected.id} · {selected.party}</p></div><button type="button" aria-label="Close investigation" onClick={(event) => event.currentTarget.closest("dialog")?.close()}><X size={20} /></button></div>
          <dl className="detail-list"><div><dt>Source state</dt><dd>{selected.status}</dd></div><div><dt>Severity</dt><dd>{selected.severity}</dd></div><div><dt>Supported amount</dt><dd>{selected.exposure === null ? "Undetermined" : money(selected.exposure)}</dd></div><div><dt>Possible reason</dt><dd>{selected.reason}</dd></div></dl>
          <h3>Recommended investigation</h3><p className="footnote">{selected.action}</p>
          <h3>Source references</h3>
          {selected.evidence.map((id) => {
            const row = [...financePreview.invoices, ...financePreview.bills].find((item) => item.id === id);
            return row ? <Link className="allocation evidence-text-link" key={id} href={`/${id.startsWith("ARI") ? "receivables?invoice" : "payables?bill"}=${id}`}>{id} · {row.number}<p>{row.party} · {money(row.face)}</p></Link> : <div className="allocation" key={id}>{id}</div>;
          })}
          {selected.kind === "Unallocated receipt" && <p className="footnote">Source ar_receipts.csv. Cash remains separate until a valid allocation is recorded.</p>}
          <p className="footnote">A source flag justifies review. It does not establish fraud or authorise payments, write-offs or ledger changes.</p>
        </EvidenceDrawer>
      )}
    </>
  );
}
