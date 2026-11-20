import { DataTableSkeleton, Skeleton, StatCardsSkeleton } from "@/components/ui/loading-skeletons";

const pages = {
  overview: "Overview",
  receivables: "Receivables",
  payables: "Payables",
  exceptions: "Risk and exceptions",
  actions: "Action queue",
  assistant: "Assistant",
};

type Screen = keyof typeof pages;

function LoadingHeading() {
  return (
    <div className="page-heading" aria-hidden="true">
      <Skeleton className="skeleton-heading" />
      <Skeleton className="skeleton-control" />
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <LoadingHeading />
      <div className="overview-board" aria-hidden="true">
        <div className="overview-analysis">
          <div className="overview-section">
            <Skeleton className="skeleton-title" />
            <StatCardsSkeleton charts={[true, true, true, false]} embedded />
          </div>
          <div className="overview-section">
            <div className="overview-section-heading"><Skeleton className="skeleton-title" /><Skeleton className="skeleton-control" /></div>
            <Skeleton className="skeleton-main-chart" />
            <Skeleton className="skeleton-caption" />
          </div>
          <div className="overview-section">
            <Skeleton className="skeleton-title" />
            <div className="skeleton-review-list">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index}><Skeleton className="skeleton-caption" /><Skeleton className="skeleton-label" /></div>
              ))}
            </div>
          </div>
          <div className="overview-section"><Skeleton className="skeleton-title" /></div>
        </div>
        <div className="overview-invoices">
          <div className="overview-section ageing-summary">
            <Skeleton className="skeleton-title" />
            <StatCardsSkeleton charts={[false, false, false]} />
            <Skeleton className="skeleton-ageing-bar" />
          </div>
          <div className="overview-section">
            <Skeleton className="skeleton-title" />
            <DataTableSkeleton columns={5} rows={10} compact />
          </div>
        </div>
      </div>
    </>
  );
}

function AssistantSkeleton() {
  return (
    <div className="assistant-page" aria-hidden="true">
      <div className="assistant-session"><Skeleton className="skeleton-label" /></div>
      <div className="assistant-welcome">
        <Skeleton className="skeleton-assistant-mark" />
        <Skeleton className="skeleton-assistant-heading" />
        <div className="assistant-prompts">
          {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="skeleton-control" />)}
        </div>
      </div>
      <div className="composer-area"><Skeleton className="skeleton-composer" /></div>
    </div>
  );
}

export function DashboardLoading({ screen }: { screen: Screen }) {
  const finance = screen === "receivables" || screen === "payables";
  return (
    <>
      <span className="sr-only" role="status">Loading {pages[screen]}…</span>
      {screen === "overview" ? <OverviewSkeleton /> : screen === "assistant" ? <AssistantSkeleton /> : (
        <>
          <LoadingHeading />
          {finance && <StatCardsSkeleton charts={[true, false, false]} />}
          <div className="panel data-panel" aria-hidden="true">
            <Skeleton className="skeleton-title" />
            <DataTableSkeleton columns={7} rows={screen === "receivables" ? 5 : 3} compact={screen === "receivables"} />
          </div>
        </>
      )}
    </>
  );
}
