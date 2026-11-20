"use client";

import { useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { money, reportingDate } from "@/lib/demo-data";
import { financePreview } from "./preview-data";

type Basis = "due" | "date";
const daysApart = (end: string, start: string) => Math.floor((Date.parse(end) - Date.parse(start)) / 86_400_000);

export function AgeingAnalysis({ ledger }: { ledger: "ar" | "ap" }) {
  const [basis, setBasis] = useState<Basis>("due");
  const [boundaries, setBoundaries] = useState([30, 60, 90]);
  const [draft, setDraft] = useState(["30", "60", "90"]);
  const [error, setError] = useState("");
  const documents = ledger === "ar" ? financePreview.invoices : financePreview.bills;
  const positive = documents.filter((row) => row.outstanding > 0);
  const total = positive.reduce((sum, row) => sum + row.outstanding, 0);
  const groups = [
    { label: basis === "due" ? "Current" : "0 days", amount: 0 },
    { label: `1–${boundaries[0]} days`, amount: 0 },
    { label: `${boundaries[0] + 1}–${boundaries[1]} days`, amount: 0 },
    { label: `${boundaries[1] + 1}–${boundaries[2]} days`, amount: 0 },
    { label: `${boundaries[2] + 1}+ days`, amount: 0 },
  ];
  for (const row of positive) {
    const elapsed = daysApart(reportingDate, row[basis]);
    const index = elapsed <= 0 ? 0 : elapsed <= boundaries[0] ? 1 : elapsed <= boundaries[1] ? 2 : elapsed <= boundaries[2] ? 3 : 4;
    groups[index].amount += row.outstanding;
  }

  function apply() {
    const values = draft.map(Number);
    if (values.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 3650) || values[0] >= values[1] || values[1] >= values[2]) {
      setError("Enter three increasing whole-day boundaries between 1 and 3650.");
      return;
    }
    setBoundaries(values);
    setError("");
  }

  return (
    <section className="panel finance-panel">
      <header className="finance-panel-heading"><div><h2>{ledger === "ar" ? "Receivable" : "Payable"} ageing</h2><p>Positive balances as of 31 Dec 2025</p></div></header>
      <div className="finance-controls">
        <label>Ageing basis<select value={basis} onChange={(event) => setBasis(event.target.value as Basis)}><option value="due">Due date</option><option value="date">Original document date</option></select></label>
        <form onSubmit={(event) => { event.preventDefault(); apply(); }} className="bucket-form">
          <fieldset><legend>Bucket end days</legend>{draft.map((value, index) => <input key={index} type="number" aria-label={`Bucket ${index + 1} end day`} value={value} min={1} max={3650} onChange={(event) => setDraft((previous) => previous.map((old, i) => i === index ? event.target.value : old))} />)}</fieldset>
          <button type="submit" className="table-tool-button">Apply</button>
        </form>
      </div>
      {error && <p className="finance-validation" role="alert">{error}</p>}
      <div className="finance-bar-list">
        {groups.map((group) => <div key={group.label}><span>{group.label}</span><strong>{money(group.amount)}</strong><div className="finance-bar-track" aria-hidden="true"><span style={{ width: `${total ? group.amount / total * 100 : 0}%` }} /></div></div>)}
      </div>
      <DataTable label="Ageing source documents" rows={positive} getRowKey={(row) => row.id} columns={[
        { id: "id", label: "Source", cell: (row) => <a className="text-link" href={`/${ledger === "ar" ? "receivables?invoice" : "payables?bill"}=${row.id}`}>{row.number}</a> },
        { id: "party", label: "Party", cell: (row) => row.party },
        { id: "date", label: "Original date", cell: (row) => row.date },
        { id: "due", label: "Due date", cell: (row) => row.due },
        { id: "amount", label: "Outstanding", align: "right", compare: (a, b) => a.outstanding - b.outstanding, cell: (row) => money(row.outstanding) },
      ]} search={{ label: "Search ageing records", placeholder: "Search party or invoice", getText: (row) => `${row.party} ${row.number}` }} pageSize={8} />
      <p className="footnote">Original document dates remain fixed after partial settlement. Due today counts as current. Unallocated cash is excluded from document settlement.</p>
    </section>
  );
}
