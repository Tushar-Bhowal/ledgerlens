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
    <div className="flex flex-col flex-1 h-full max-h-full min-h-0 overflow-hidden relative bg-background text-foreground assistant-page" aria-hidden="true">
      <div className="flex flex-none items-center justify-between min-h-[42px] px-3.5 sm:px-6 md:px-8 py-1"><Skeleton className="w-24 h-4 rounded-md" /></div>
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-8 md:py-12 px-4 text-center">
        <Skeleton className="size-[50px] rounded-2xl mb-4" />
        <Skeleton className="w-[min(400px,80vw)] h-[43px] rounded-xl mb-6" />
        <div className="flex flex-wrap justify-center gap-2">
          {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="w-32 h-[42px] rounded-xl" />)}
        </div>
      </div>
      <div className="flex-none w-full px-3.5 sm:px-6 pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))] bg-background border-t border-border/50">
        <div className="w-full max-w-[780px] mx-auto"><Skeleton className="w-full h-[108px] rounded-2xl" /></div>
      </div>
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
