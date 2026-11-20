"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleAlert, RotateCcw, X } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { DataTableSkeleton } from "@/components/ui/loading-skeletons";
import { StateMessage } from "@/components/ui/state-message";
import { EvidenceDrawer } from "@/components/dashboard/evidence-drawer";
import { money } from "@/lib/demo-data";
import type { ExceptionItem } from "@/server/finance/exceptions";

export function ExceptionExplorer({ issueId }: { issueId?: string }) {
  const [liveData, setLiveData] = useState<{ rows: ExceptionItem[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<ExceptionItem | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/finance/exceptions", { signal: controller.signal, cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Exceptions unavailable");
        return res.json() as Promise<{ rows: ExceptionItem[]; total: number }>;
      })
      .then((data) => {
        setLiveData(data);
        setLoading(false);
        if (issueId) {
          const match = data.rows.find((row) => row.id === issueId || row.evidence.includes(issueId));
          if (match) setSelected(match);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [issueId]);

  const issues: ExceptionItem[] = liveData?.rows ?? [];

  return (
    <>
      <section className="panel finance-panel">
        <header className="finance-panel-heading">
          <div>
            <h2>Investigation register</h2>
            <p>Source-derived flags · High severity first, then supported exposure</p>
          </div>
        </header>
        <p className="footnote">
          Rows can flag the same document for different reasons. Their amounts must not be added together. Undetermined exposure stays unavailable.
        </p>
        {loading && <DataTableSkeleton columns={6} rows={8} />}
        {error && !loading && (
          <StateMessage icon={CircleAlert} title="Exceptions unavailable" description="The investigation register could not be loaded from the database.">
            <button type="button" className="table-tool-button" onClick={() => setLoading(true)}>
              <RotateCcw size={16} aria-hidden="true" /> Try again
            </button>
          </StateMessage>
        )}
        {!loading && !error && (
          <DataTable
            label="Investigation register"
            rows={issues}
            getRowKey={(row) => row.id}
            getRowLabel={(row) => row.id}
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
            ]}
            pageSize={8}
          />
        )}
      </section>
      {selected && (
        <EvidenceDrawer titleId="investigation-title" onClose={() => setSelected(null)}>
          <div className="modal-header">
            <div>
              <span className="mini-label">SOURCE INVESTIGATION</span>
              <h2 id="investigation-title">{selected.kind}</h2>
              <p>{selected.id} · {selected.party}</p>
            </div>
            <button type="button" aria-label="Close investigation" onClick={() => setSelected(null)}>
              <X size={20} />
            </button>
          </div>
          <dl className="detail-list">
            <div><dt>Source state</dt><dd>{selected.status}</dd></div>
            <div><dt>Severity</dt><dd>{selected.severity}</dd></div>
            <div><dt>Supported amount</dt><dd>{selected.exposure === null ? "Undetermined" : money(selected.exposure)}</dd></div>
            <div><dt>Possible reason</dt><dd>{selected.reason}</dd></div>
          </dl>
          <h3>Recommended investigation</h3>
          <p className="footnote">{selected.action}</p>
          <h3>Source references</h3>
          {selected.evidence.map((id) => (
            <Link className="allocation evidence-text-link" key={id} href={`/${id.startsWith("ARI") ? "receivables?invoice" : "payables?bill"}=${id}`}>
              {id}
            </Link>
          ))}
          {selected.kind === "Unallocated receipt" && <p className="footnote">Source ar_receipts.csv. Cash remains separate until a valid allocation is recorded.</p>}
          <p className="footnote">A source flag justifies review. It does not establish fraud or authorise payments, write-offs or ledger changes.</p>
        </EvidenceDrawer>
      )}
    </>
  );
}
