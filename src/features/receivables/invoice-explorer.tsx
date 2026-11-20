"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BadgeIndianRupee, CalendarDays, Check, CircleAlert, Clock3, FileText, WalletCards } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { financePreview, type FinanceDocument } from "@/features/finance/preview-data";
import { DocumentEvidence } from "@/features/finance/document-evidence";
import { money, reportingDate } from "@/lib/demo-data";

function invoiceStatus(item: FinanceDocument) {
  if (item.outstanding <= 0) return "Settled";
  return item.due < reportingDate ? "Overdue" : "Current";
}

export function InvoiceExplorer({ invoiceId, compact = false, customerId }: { invoiceId?: string; compact?: boolean; customerId?: string }) {
  const [selected, setSelected] = useState(() => financePreview.invoices.find((invoice) => invoice.id === invoiceId) ?? null);
  const rows = customerId ? financePreview.invoices.filter((row) => row.partyId === customerId) : financePreview.invoices;
  const columns: DataTableColumn<FinanceDocument>[] = [
    {
      id: "invoice", label: "Invoice", icon: FileText, compare: (a, b) => a.number.localeCompare(b.number),
      cell: (item) => <button type="button" className="invoice-record" aria-label={`View ${item.number}`} onClick={() => setSelected(item)}><span className="table-record-text"><strong>{item.party}</strong><small>{item.number} · {item.id}</small></span></button>,
    },
    { id: "due", label: "Due date", icon: CalendarDays, compare: (a, b) => a.due.localeCompare(b.due), cell: (item) => <time dateTime={item.due}>{item.due}</time> },
    ...(!compact ? [{
      id: "status", label: "Status", cell: (item: FinanceDocument) => {
        const status = invoiceStatus(item);
        const Icon = status === "Settled" ? Check : status === "Overdue" ? CircleAlert : Clock3;
        return <span className={`table-status ${status.toLowerCase()}`}><Icon size={12} aria-hidden="true" />{status}</span>;
      },
    }, { id: "billed", label: "Invoice amount", icon: BadgeIndianRupee, align: "right" as const, cell: (item: FinanceDocument) => money(item.face) }] : []),
    { id: "outstanding", label: "Outstanding", icon: WalletCards, align: "right", compare: (a, b) => a.outstanding - b.outstanding, cell: (item) => money(item.outstanding) },
  ];
  return (
    <>
      <section className={compact ? "overview-section invoice-dashboard" : "panel data-panel invoice-dashboard"}>
        <div className="overview-section-heading"><div><h2>Customer invoices</h2><p>{rows.length} source records · Prepared preview</p></div>{compact && <Link className="text-link" href="/receivables">Receivables <ArrowRight size={15} /></Link>}</div>
        <DataTable label="Customer invoices" rows={rows} columns={columns} selectable getRowKey={(row) => row.id} getRowLabel={(row) => row.number}
          rowActions={(row) => [{ label: "View evidence", onSelect: () => setSelected(row) }]}
          search={{ label: "Search invoices", placeholder: "Search invoices", getText: (row) => `${row.party} ${row.number} ${row.id}` }}
          filters={[{ id: "status", label: "Invoice status", allLabel: "All statuses", options: ["Overdue", "Current", "Settled"].map((value) => ({ value, label: value })), getValue: invoiceStatus, display: "buttons" }]}
          defaultSort={{ columnId: "invoice", direction: "ascending" }} pageSize={compact ? 10 : 8} density="compact" />
      </section>
      {selected && <DocumentEvidence document={selected} ledger="ar" onClose={() => setSelected(null)} />}
    </>
  );
}
