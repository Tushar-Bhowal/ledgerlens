"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { DataTableSkeleton } from "@/components/ui/loading-skeletons";
import { StateMessage } from "@/components/ui/state-message";
import { StatCard } from "@/components/ui/stat-card";
import { money } from "@/lib/demo-data";
import type { OpportunitiesResult, OverdueOpportunity } from "@/server/finance/opportunities";

export function Opportunities() {
  const [liveData, setLiveData] = useState<OpportunitiesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/finance/opportunities", { signal: controller.signal, cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Opportunities unavailable");
        return res.json() as Promise<OpportunitiesResult>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setLiveData(data);
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

  const totals = liveData?.totals ?? { actionable: 0, disputed: 0, overdue: 0 };
  const rows: OverdueOpportunity[] = liveData?.opportunities ?? [];
  const unallocRows = liveData?.unallocated ?? [];
  const unallocTotal = unallocRows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <section className="panel finance-panel">
      <header className="finance-panel-heading">
        <div>
          <h2>Collection opportunities</h2>
          <p>Unique overdue invoices</p>
        </div>
      </header>

      {loading && <DataTableSkeleton columns={3} rows={4} />}
      {error && !loading && (
        <StateMessage icon={CircleAlert} title="Opportunities unavailable" description="Failed to calculate opportunities from database.">
          <button type="button" className="table-tool-button" onClick={() => { setError(false); setLoading(true); setAttempt((value) => value + 1); }}><RotateCcw size={16} aria-hidden="true" /> Try again</button>
        </StateMessage>
      )}

      {!loading && !error && (
        <>
          <div className="stat-strip">
            <StatCard label="Actionable overdue" value={totals.actionable} format="rupees" caption="After unresolved disputed portions" />
            <StatCard label="Disputed overdue" value={totals.disputed} format="rupees" caption="Capped at each invoice’s open amount" attention />
            <StatCard label="Total overdue" value={totals.overdue} format="rupees" caption="Actionable plus disputed" />
          </div>
          <p className="footnote">
            Each invoice appears once. These are reviewable balances, not guaranteed receipts. Open and Under Review disputes are excluded from the collection portion only where their dates and invoice links are consistent.
          </p>
          <DataTable
            label="Collection opportunities by invoice"
            rows={rows}
            getRowKey={(row) => row.id}
            columns={[
              { id: "source", label: "Invoice", cell: (row) => <Link className="text-link" href={`/receivables?invoice=${row.id}`}>{row.number}</Link> },
              { id: "party", label: "Customer", cell: (row) => row.party },
              { id: "due", label: "Due date", cell: (row) => row.due },
              { id: "overdue", label: "Overdue", align: "right", cell: (row) => money(row.overdue) },
              { id: "disputed", label: "Disputed portion", align: "right", cell: (row) => money(row.disputed) },
              { id: "actionable", label: "Collection portion", align: "right", compare: (a, b) => a.actionable - b.actionable, cell: (row) => money(row.actionable) },
              { id: "step", label: "Next step", cell: (row) => row.step },
            ]}
            search={{ label: "Search opportunities", placeholder: "Search customer or invoice", getText: (row) => `${row.party} ${row.id} ${row.number}` }}
            defaultSort={{ columnId: "actionable", direction: "descending" }}
            pageSize={8}
          />
          <h3>
            Unallocated receipts · {money(unallocTotal)}
          </h3>
          <p className="footnote">This cash has already been received. It is an allocation task and stays outside the collection opportunity total.</p>
          <DataTable
            label="Unallocated receipt review"
            rows={unallocRows}
            getRowKey={(row) => row.id}
            columns={[
              { id: "receipt", label: "Receipt", cell: (row) => <Link className="text-link" href={`/exceptions?issue=${row.id}`}>{row.id}</Link> },
              { id: "customer", label: "Customer", cell: (row) => row.partyName },
              { id: "amount", label: "Unallocated", align: "right", cell: (row) => money(row.amount) },
            ]}
            pageSize={false}
          />
        </>
      )}
    </section>
  );
}
