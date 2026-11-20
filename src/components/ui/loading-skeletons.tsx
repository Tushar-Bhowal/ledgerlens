import type { CSSProperties } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton-block ${className}`} />;
}

export function StatCardsSkeleton({ charts, embedded = false }: { charts: readonly boolean[]; embedded?: boolean }) {
  return (
    <div className={embedded ? "stat-strip stat-strip-embedded" : "stat-strip"} aria-hidden="true">
      {charts.map((chart, index) => (
        <div className="stat-card skeleton-stat" key={index}>
          <Skeleton className="skeleton-label" />
          <Skeleton className="skeleton-value" />
          {chart ? <Skeleton className="skeleton-mini-chart" /> : <Skeleton className="skeleton-caption" />}
        </div>
      ))}
    </div>
  );
}

export function DataTableSkeleton({ columns, rows, compact = false }: { columns: number; rows: number; compact?: boolean }) {
  return (
    <div className={compact ? "data-table compact-table" : "data-table"} aria-hidden="true" style={{ "--skeleton-columns": columns } as CSSProperties}>
      <div className="table-toolbar">
        <Skeleton className="skeleton-search" />
        <Skeleton className="skeleton-control" />
        <Skeleton className="skeleton-control" />
      </div>
      <div className="skeleton-table-row skeleton-table-heading">
        {Array.from({ length: columns }, (_, index) => <Skeleton key={index} className="skeleton-cell" />)}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="skeleton-table-row">
          {Array.from({ length: columns }, (_, column) => <Skeleton key={column} className="skeleton-cell" />)}
        </div>
      ))}
      <div className="table-footer"><Skeleton className="skeleton-label" /><Skeleton className="skeleton-pagination" /></div>
    </div>
  );
}
