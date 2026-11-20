"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Popover } from "radix-ui";
import { AlertCircle, ArrowDown, ArrowDownUp, ArrowRight, ArrowUp, BadgeIndianRupee, CalendarDays, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleAlert, Clock3, FileText, Inbox, Search, Settings, SlidersHorizontal, WalletCards, X } from "lucide-react";
import { StateMessage } from "@/components/ui/state-message";
import { RowActions } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/loading-skeletons";
import { EvidenceDrawer } from "@/components/dashboard/evidence-drawer";

type Ledger = "ar" | "ap";
type DocumentRow = {
  id: string;
  number: string | null;
  partyId: string;
  party: string;
  date: string | null;
  posted: string | null;
  due: string | null;
  face: string | null;
  paid: string | null;
  adjustment: string | null;
  outstanding: string | null;
  status: string;
  criticality: string | null;
  termsDays: number | null;
  msme: boolean | null;
  purchaseOrder: string | null;
  grn: string | null;
};

type Allocation = {
  id: string;
  cashId: string;
  date: string | null;
  amount: string | null;
  reference: string | null;
  approval: string | null;
  sourceFilename: string;
  sourceRecordNumber: number;
};

type Adjustment = {
  id: string;
  date: string | null;
  type: string | null;
  amount: string | null;
  reference: string | null;
  sourceFilename: string;
  sourceRecordNumber: number;
};

type DocumentDetail = DocumentRow & {
  allocations: Allocation[];
  adjustments: Adjustment[];
  sourceFilename: string;
  sourceRecordNumber: number;
};

type DocumentPage = {
  asOf: string;
  rows: DocumentRow[];
  total: number;
  rejectedRows: number;
  page: number;
  pageSize: number;
};

type Evidence = {
  asOf: string;
  document: DocumentDetail;
};

type LoadState<T> =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: T };

function formatAmount(value: string | null) {
  if (value === null) return "Unavailable";
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return "Unavailable";
  const [, sign, whole, fraction = ""] = match;
  // Format the integer as a BigInt so large database decimals retain their exact value.
  return `${sign}₹${BigInt(whole).toLocaleString("en-IN")}.${fraction.padEnd(2, "0")}`;
}

function displayDate(date: string | null) {
  return date ?? "Unavailable";
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) {
    if (response.status === 404) throw new Error("This record could not be found.");
    throw new Error("Could not load live data. Please try again.");
  }
  return response.json() as Promise<T>;
}

function LiveEvidence({ ledger, id, onClose }: { ledger: Ledger; id: string; onClose: () => void }) {
  const [result, setResult] = useState<LoadState<Evidence>>({ state: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // Fetch evidence only when a document is opened. The ID is the source ID, not its printed number.
    getJson<Evidence>(`/api/finance/documents/${encodeURIComponent(id)}?ledger=${ledger}`, controller.signal)
      .then((data) => setResult({ state: "ready", data }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ state: "error", message: error instanceof Error ? error.message : "Could not load evidence." });
      });
    return () => controller.abort();
  }, [ledger, id, retry]);

  return (
    <EvidenceDrawer titleId="live-evidence-title" onClose={onClose}>
      <div className="modal-header">
        <div>
          <span className="mini-label">LIVE SOURCE EVIDENCE</span>
          <h2 id="live-evidence-title">{result.state === "ready" ? result.data.document.number ?? id : id}</h2>
          {result.state === "ready" && <p>{result.data.document.party} · {id} · As of {result.data.asOf}</p>}
        </div>
        <button type="button" aria-label="Close evidence" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </div>
      {result.state === "loading" && (
        <>
          <span className="sr-only" role="status">Loading evidence…</span>
          <dl className="detail-list" aria-hidden="true">
            {Array.from({ length: ledger === "ap" ? 9 : 7 }, (_, index) => (
              <div key={index}><dt><Skeleton className="skeleton-label" /></dt><dd><Skeleton className="skeleton-caption" /></dd></div>
            ))}
          </dl>
        </>
      )}
      {result.state === "error" && (
        <StateMessage compact heading="h3" icon={AlertCircle} title="Evidence unavailable" description={result.message}>
          <button type="button" className="table-tool-button" onClick={() => { setResult({ state: "loading" }); setRetry((value) => value + 1); }}>Try again</button>
        </StateMessage>
      )}
      {result.state === "ready" && (
        <>
          <dl className="detail-list">
            <div><dt>Original amount</dt><dd>{formatAmount(result.data.document.face)}</dd></div>
            <div><dt>Allocated cash</dt><dd>{formatAmount(result.data.document.paid)}</dd></div>
            <div><dt>Signed adjustments</dt><dd>{formatAmount(result.data.document.adjustment)}</dd></div>
            <div><dt>Outstanding</dt><dd>{formatAmount(result.data.document.outstanding)}</dd></div>
            <div><dt>Original date</dt><dd>{displayDate(result.data.document.date)}</dd></div>
            <div><dt>Posting date</dt><dd>{displayDate(result.data.document.posted)}</dd></div>
            <div><dt>Due date</dt><dd>{displayDate(result.data.document.due)}</dd></div>
            {ledger === "ap" && <><div><dt>Purchase order</dt><dd>{result.data.document.purchaseOrder ?? "Missing"}</dd></div><div><dt>Goods receipt</dt><dd>{result.data.document.grn ?? "Missing"}</dd></div></>}
          </dl>
          <p className="footnote">Source {result.data.document.sourceFilename} · record {result.data.document.sourceRecordNumber}</p>
          {result.data.document.outstanding === null && <p className="finance-validation" role="status">The balance is unavailable because source information or transaction integrity needs review. The records below may include amounts that cannot be applied.</p>}
          <h3>{ledger === "ar" ? "Receipt" : "Payment"} allocations</h3>
          {result.data.document.allocations.length ? result.data.document.allocations.map((item) => (
            <div className="allocation" key={item.id}>
              <strong>{item.cashId} · {formatAmount(item.amount)}</strong>
              <p>{item.id} · {displayDate(item.date)}</p>
              {item.reference && <p>Reference {item.reference}</p>}
              {item.approval && <p>Approval {item.approval}</p>}
              <p>{item.sourceFilename} · record {item.sourceRecordNumber}</p>
            </div>
          )) : <p className="footnote">{result.data.document.paid === null ? "Allocation details need further review." : "No qualifying allocations by the reporting date."}</p>}
          <h3>Adjustments</h3>
          {result.data.document.adjustments.length ? result.data.document.adjustments.map((item) => (
            <div className="allocation" key={item.id}>
              <strong>{item.id} · {item.type ?? "Type unavailable"}</strong>
              <p>{displayDate(item.date)} · {formatAmount(item.amount)}</p>
              {item.reference && <p>Reference {item.reference}</p>}
              <p>{item.sourceFilename} · record {item.sourceRecordNumber}</p>
            </div>
          )) : <p className="footnote">{result.data.document.adjustment === null ? "Adjustment details need further review." : "No qualifying adjustments by the reporting date."}</p>}
        </>
      )}
    </EvidenceDrawer>
  );
}

export function LiveDocuments({
  ledger,
  compact = false,
  initialId,
  partyId,
  nested = false,
}: {
  ledger: Ledger;
  compact?: boolean;
  initialId?: string;
  partyId?: string;
  nested?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(compact ? 10 : 8);
  const [sort, setSort] = useState<"number" | "due" | "outstanding">("number");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [selectedRows, setSelectedRows] = useState<ReadonlySet<string>>(() => new Set());
  const headerCheckbox = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string | null>(initialId ?? null);
  const [result, setResult] = useState<LoadState<DocumentPage>>({ state: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // The server applies these filters before returning one page and the total matching row count.
    const params = new URLSearchParams({ ledger, page: String(page), pageSize: String(pageSize), search, status, sort, direction });
    if (partyId) params.set("partyId", partyId);
    getJson<DocumentPage>(`/api/finance/documents?${params}`, controller.signal)
      .then((data) => {
        const lastPage = Math.max(1, Math.ceil(data.total / pageSize));
        if (page > lastPage) {
          setPage(lastPage);
        } else {
          setResult({ state: "ready", data });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ state: "error", message: error instanceof Error ? error.message : "Could not load records." });
      });
    // Cancel an older request when filters change so it cannot replace newer results.
    return () => controller.abort();
  }, [ledger, page, pageSize, search, status, partyId, retry, sort, direction]);

  function updatePage(next: number) {
    setResult({ state: "loading" });
    setPage(next);
  }

  function changeSort(column: typeof sort) {
    setResult({ state: "loading" });
    setDirection(sort === column && direction === "asc" ? "desc" : "asc");
    setSort(column);
    setPage(1);
  }

  const label = ledger === "ar" ? "Customer invoices" : "Supplier bills";
  const rows = result.state === "ready" ? result.data.rows : [];
  const total = result.state === "ready" ? result.data.total : 0;
  const pages = Math.ceil(total / pageSize);
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);
  const columnCount = ledger === "ap" ? 8 : compact ? 5 : 7;
  const selectedOnPage = rows.filter((row) => selectedRows.has(row.id)).length;
  const allSelected = rows.length > 0 && selectedOnPage === rows.length;

  useEffect(() => {
    if (headerCheckbox.current) headerCheckbox.current.indeterminate = selectedOnPage > 0 && !allSelected;
  }, [selectedOnPage, allSelected]);

  function selectRows(ids: string[], checked: boolean) {
    setSelectedRows((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  const statuses = [
    { value: "all", label: "All statuses" },
    { value: "overdue", label: "Overdue" },
    { value: "current", label: "Current" },
    { value: "settled", label: "Settled" },
    { value: "credit", label: "Credit balance" },
    { value: "unknown", label: "Unavailable" },
  ];

  return (
    <>
      <section className={nested ? "nested-finance-panel" : compact ? "overview-section invoice-dashboard" : "panel finance-panel"}>
        <header className={nested ? "finance-panel-heading" : "overview-section-heading"}>
          <div><h2>{label}</h2><p>Live database{result.state === "ready" && ` · As of ${result.data.asOf}`}</p></div>
          {compact && ledger === "ar" && <Link className="text-link" href="/receivables">Receivables <ArrowRight size={15} aria-hidden="true" /></Link>}
        </header>
        {result.state === "ready" && result.data.rejectedRows > 0 && (
          <p className="finance-validation" role="status">The import rejected {result.data.rejectedRows} source records. Results may be incomplete.</p>
        )}
        <div className={compact ? "data-table compact-table" : "data-table"}>
          <div className="table-toolbar">
            <label className="search-box">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Search {label.toLowerCase()}</span>
              <input type="search" value={draft} maxLength={100} onChange={(event) => { const next = event.target.value.trim(); setDraft(event.target.value); if (next !== search || page !== 1) { setResult({ state: "loading" }); setSearch(next); setPage(1); } }} placeholder={ledger === "ar" ? "Search invoices" : "Search supplier or bill"} />
            </label>
            <Popover.Root>
              <Popover.Trigger className="table-tool-button" type="button"><ArrowDownUp size={15} aria-hidden="true" /> Sort</Popover.Trigger>
              <Popover.Portal><Popover.Content className="table-popup" aria-label="Sort table" align="start" sideOffset={6}>
                <label className="table-sort-field"><span>Sort by</span><select value={sort} onChange={(event) => { setResult({ state: "loading" }); setSort(event.target.value as typeof sort); setPage(1); }}><option value="number">{ledger === "ar" ? "Invoice" : "Bill"}</option><option value="due">Due date</option><option value="outstanding">Outstanding</option></select></label>
                <div className="table-filter-buttons" role="group" aria-label="Sort direction">{(["asc", "desc"] as const).map((value) => <button key={value} type="button" aria-pressed={direction === value} onClick={() => { if (value !== direction) { setResult({ state: "loading" }); setDirection(value); setPage(1); } }}>{value === "asc" ? "Ascending" : "Descending"}</button>)}</div>
              </Popover.Content></Popover.Portal>
            </Popover.Root>
            <Popover.Root>
              <Popover.Trigger className="table-tool-button" type="button"><SlidersHorizontal size={15} aria-hidden="true" /> Filter {status !== "all" && <span className="table-filter-count">1</span>}</Popover.Trigger>
              <Popover.Portal><Popover.Content className="table-popup" aria-label="Filter table" align="start" sideOffset={6}>
                <fieldset className="table-popup-group"><legend>Document status</legend><div className="table-filter-buttons">{statuses.map((item) => <button key={item.value} type="button" aria-pressed={status === item.value} onClick={() => { if (status !== item.value) { setResult({ state: "loading" }); setStatus(item.value); setPage(1); } }}>{item.label}</button>)}</div></fieldset>
                <Popover.Close className="table-tool-button" type="button">Done</Popover.Close>
              </Popover.Content></Popover.Portal>
            </Popover.Root>
          </div>
          {result.state === "loading" && <span className="sr-only" role="status">Loading live records…</span>}
          <div className="table-wrap" aria-busy={result.state === "loading"}>
            <table aria-label={label}>
              <thead><tr>
                {ledger === "ar" && <th scope="col" className="table-selection-cell"><input ref={headerCheckbox} type="checkbox" aria-label="Select all rows on this page" checked={allSelected} disabled={!rows.length} onChange={(event) => selectRows(rows.map((row) => row.id), event.target.checked)} /></th>}
                <th scope="col" aria-sort={sort === "number" ? (direction === "asc" ? "ascending" : "descending") : undefined}><button type="button" className="table-heading sort-button" onClick={() => changeSort("number")}><FileText size={15} aria-hidden="true" />{ledger === "ar" ? "Invoice" : "Bill"}{sort === "number" && (direction === "asc" ? <ArrowUp className="sort-indicator" size={13} aria-hidden="true" /> : <ArrowDown className="sort-indicator" size={13} aria-hidden="true" />)}</button></th>
                <th scope="col" aria-sort={sort === "due" ? (direction === "asc" ? "ascending" : "descending") : undefined}><button type="button" className="table-heading sort-button" onClick={() => changeSort("due")}><CalendarDays size={15} aria-hidden="true" />Due date{sort === "due" && (direction === "asc" ? <ArrowUp className="sort-indicator" size={13} aria-hidden="true" /> : <ArrowDown className="sort-indicator" size={13} aria-hidden="true" />)}</button></th>
                {ledger === "ap" && <><th scope="col"><span className="table-heading">Criticality</span></th><th scope="col"><span className="table-heading">Terms</span></th></>}
                {(!compact || ledger === "ap") && <th scope="col"><span className="table-heading">Status</span></th>}
                {!compact && ledger === "ar" && <th scope="col" className="amount-cell"><span className="table-heading"><BadgeIndianRupee size={15} aria-hidden="true" />Invoice amount</span></th>}
                <th scope="col" className="amount-cell" aria-sort={sort === "outstanding" ? (direction === "asc" ? "ascending" : "descending") : undefined}><button type="button" className="table-heading sort-button" onClick={() => changeSort("outstanding")}><WalletCards size={15} aria-hidden="true" />Outstanding{sort === "outstanding" && (direction === "asc" ? <ArrowUp className="sort-indicator" size={13} aria-hidden="true" /> : <ArrowDown className="sort-indicator" size={13} aria-hidden="true" />)}</button></th>
                {ledger === "ap" && <th scope="col"><span className="table-heading">Source controls</span></th>}
                <th scope="col" className="table-action-cell" aria-label="Actions"><span className="table-heading"><Settings size={14} aria-hidden="true" /><span>Action</span></span></th>
              </tr></thead>
              <tbody>
                {result.state === "loading" && Array.from({ length: Math.min(pageSize, 10) }, (_, index) => (
                  <tr key={index} aria-hidden="true">
                    {Array.from({ length: columnCount }, (_, column) => (
                      <td key={column}><Skeleton className="skeleton-cell" /></td>
                    ))}
                  </tr>
                ))}
                {rows.map((row) => (
                  <tr key={row.id} data-selected={selectedRows.has(row.id) || undefined}>
                    {ledger === "ar" && <td className="table-selection-cell"><input type="checkbox" aria-label={`Select ${row.number ?? row.id}, ${row.party}, ${row.id}`} checked={selectedRows.has(row.id)} onChange={(event) => selectRows([row.id], event.target.checked)} /></td>}
                    <td><button type="button" className="invoice-record" onClick={() => setSelected(row.id)} aria-label={`View ${row.number ?? row.id}, ${row.party}, ${row.id}`}><span className="table-record-text"><strong>{ledger === "ar" ? row.party : row.number ?? row.id}</strong><small>{ledger === "ar" ? `${row.number ?? "Number unavailable"} · ${row.id}` : row.party}</small></span></button></td>
                    <td>{displayDate(row.due)}</td>
                    {ledger === "ap" && <><td>{row.criticality ?? "Unavailable"}</td><td>{row.termsDays === null ? "Unavailable" : `${row.termsDays} days`}{row.msme === true && " · MSME"}</td></>}
                    {(!compact || ledger === "ap") && <td><span className={`table-status ${["settled", "overdue", "current"].includes(row.status) ? row.status : ""}`}>{row.status === "settled" ? <Check size={12} aria-hidden="true" /> : row.status === "overdue" ? <CircleAlert size={12} aria-hidden="true" /> : row.status === "current" ? <Clock3 size={12} aria-hidden="true" /> : null}{statuses.find((item) => item.value === row.status)?.label ?? "Unavailable"}</span></td>}
                    {!compact && ledger === "ar" && <td className="amount-cell">{formatAmount(row.face)}</td>}
                    <td className="amount-cell">{formatAmount(row.outstanding)}</td>
                    {ledger === "ap" && <td>{[!row.purchaseOrder && "PO missing", !row.grn && "GRN missing"].filter(Boolean).join(" · ") || "PO and GRN present"}</td>}
                    <td className="table-action-cell"><RowActions label={`${row.number ?? row.id}, ${row.party}, ${row.id}`} actions={[{ label: "View evidence", onSelect: () => setSelected(row.id) }]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.state === "error" && <StateMessage compact heading="h3" icon={AlertCircle} title="Records unavailable" description={result.message}><button type="button" className="table-tool-button" onClick={() => { setResult({ state: "loading" }); setRetry((value) => value + 1); }}>Try again</button></StateMessage>}
          {result.state === "ready" && !rows.length && <StateMessage compact heading="h3" icon={Inbox} title="No matching records" description="Try a different search or status.">{(search || status !== "all") && <button type="button" className="table-tool-button" onClick={() => { setDraft(""); setSearch(""); setStatus("all"); setPage(1); setResult({ state: "loading" }); }}>Clear search and filters</button>}</StateMessage>}
          <div className="table-footer">
            <div className="table-summary"><span role="status">{result.state === "ready" ? `${first}–${last} of ${total} rows${selectedRows.size ? ` · ${selectedRows.size} selected` : ""}` : "Rows unavailable"}</span>{selectedRows.size > 0 && <button type="button" className="table-clear" onClick={() => setSelectedRows(new Set())}>Clear selection</button>}</div>
            <div className="table-pagination-controls">
              <label className="table-page-size">Rows per page
                <select value={pageSize} onChange={(event) => { setResult({ state: "loading" }); setPageSize(Number(event.target.value)); setPage(1); }}>
                  {(compact ? [10, 20, 50, 100] : [8, 10, 20, 50, 100]).map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <nav className="pagination" aria-label={`${label} pagination`}>
                <span className="table-page-position">Page {total ? page : 0} of {pages}</span>
                <div className="table-page-buttons">
                  <button className="table-page-jump" type="button" aria-label="First page" disabled={result.state !== "ready" || page <= 1} onClick={() => updatePage(1)}><ChevronsLeft size={16} aria-hidden="true" /></button>
                  <button type="button" aria-label="Previous page" disabled={result.state !== "ready" || page <= 1} onClick={() => updatePage(page - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
                  <button type="button" aria-label="Next page" disabled={result.state !== "ready" || page >= pages} onClick={() => updatePage(page + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
                  <button className="table-page-jump" type="button" aria-label="Last page" disabled={result.state !== "ready" || page >= pages} onClick={() => updatePage(pages)}><ChevronsRight size={16} aria-hidden="true" /></button>
                </div>
              </nav>
            </div>
          </div>
        </div>
      </section>
      {selected && <LiveEvidence key={selected} ledger={ledger} id={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
