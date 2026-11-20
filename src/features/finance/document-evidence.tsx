"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { EvidenceDrawer } from "@/components/dashboard/evidence-drawer";
import { money } from "@/lib/demo-data";
import type { FinanceDocument } from "./preview-data";

export function DocumentEvidence({ document: row, ledger, onClose }: { document: FinanceDocument; ledger: "ar" | "ap"; onClose: () => void }) {
  const titleId = `${ledger}-document-evidence`;
  return (
    <EvidenceDrawer titleId={titleId} onClose={onClose}>
      <div className="modal-header">
        <div><span className="mini-label">SOURCE EVIDENCE · 31 DEC 2025</span><h2 id={titleId}>{row.number}</h2><p>{row.party} · {row.id}</p></div>
        <button type="button" aria-label="Close evidence" onClick={(event) => event.currentTarget.closest("dialog")?.close()}><X size={20} aria-hidden="true" /></button>
      </div>
      <dl className="detail-list">
        <div><dt>Original amount</dt><dd>{money(row.face)}</dd></div>
        <div><dt>Allocated cash</dt><dd>− {money(row.paid)}</dd></div>
        <div><dt>Signed adjustments</dt><dd>{money(row.adjustment)}</dd></div>
        <div><dt>Outstanding</dt><dd>{money(row.outstanding)}</dd></div>
        <div><dt>Original date</dt><dd>{row.date}</dd></div>
        <div><dt>Posting date</dt><dd>{row.posted}</dd></div>
        <div><dt>Due date</dt><dd>{row.due}</dd></div>
        {ledger === "ap" && <><div><dt>Purchase order</dt><dd>{row.po || "Missing"}</dd></div><div><dt>Goods receipt</dt><dd>{row.grn || "Missing"}</dd></div></>}
      </dl>
      <h3>{ledger === "ar" ? "Receipt" : "Payment"} allocations</h3>
      {row.allocations.length ? row.allocations.map((item) => (
        <div className="allocation" key={item.id}><strong>{item.cashId} · {money(item.amount)}</strong><p>{item.id} · {item.date}</p>{item.approval && <p>Approval {item.approval}</p>}</div>
      )) : <p className="footnote">No qualifying allocations by the reporting date.</p>}
      {row.adjustments.length > 0 && <><h3>Adjustments</h3>{row.adjustments.map((item) => <div className="allocation" key={item.id}>{item.id} · {item.type}<p>{item.date} · {money(item.amount)}</p></div>)}</>}
      {row.disputes.length > 0 && <><h3>Disputes</h3>{row.disputes.map((item) => <Link className="allocation evidence-text-link" key={item.id} href={`/exceptions?issue=${item.id}`}>{item.id} · {item.status}<p>{item.reason} · {money(item.amount)}</p></Link>)}</>}
      {row.holds.length > 0 && <><h3>Payment holds</h3>{row.holds.map((item) => <div className="allocation" key={item.id}>{item.id} · {item.status}<p>{item.reason} · {item.date}{item.released && ` · Released ${item.released}`}</p></div>)}</>}
      {row.followups.length > 0 && <><h3>Collection follow-ups</h3>{row.followups.map((item) => <div className="allocation" key={item.id}>{item.id} · {item.status}<p>Owner {item.owner} · Promise {item.promise}</p>{!item.chronologyValid && <p>Source date precedes the invoice. Review before escalation.</p>}</div>)}</>}
      <p className="footnote">Prepared source snapshot · {ledger}_invoices.csv, allocation and adjustment files. Amounts exclude transactions effective after 31 December 2025.</p>
    </EvidenceDrawer>
  );
}
