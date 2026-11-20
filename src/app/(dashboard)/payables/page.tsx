import { notFound } from "next/navigation";
import { financePreview } from "@/features/finance/preview-data";
import { ArrowUpRight, FileSearch, ShieldAlert } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { BalanceSparkline } from "@/components/dashboard/balance-sparkline";
import { PageHeading } from "@/components/dashboard/page-heading";
import { BillExplorer } from "@/features/payables/bill-explorer";
import { FinanceDashboard } from "@/features/finance/finance-dashboard";
import { AgeingAnalysis } from "@/features/finance/ageing-analysis";
import { PeriodAnalysis } from "@/features/finance/period-analysis";
import { AnalyticsSummary } from "@/features/finance/analytics-summary";
import { snapshot } from "@/lib/demo-data";

export default async function PayablesPage({ searchParams }: { searchParams: Promise<{ bill?: string | string[]; vendor?: string | string[]; view?: string | string[] }> }) {
  const { bill, vendor, view } = await searchParams;
  const billId = typeof bill === "string" ? bill : undefined;
  if (billId && !financePreview.bills.some((row) => row.id === billId)) notFound();
  const vendorId = typeof vendor === "string" ? vendor : undefined;
  if (vendorId && !financePreview.vendors.some((row) => row.vendor_id === vendorId)) notFound();
  const allowedViews = ["bills", "priorities", "ageing", "period", "measures"];
  const selectedView = typeof view === "string" && allowedViews.includes(view) ? view : "bills";
  return (
    <>
      <PageHeading title="Payables" description="Review supplier bills and the information attached to them." />
      <div className="stat-strip">
        <StatCard label="Net payables" value={snapshot.payablesCrore} format="crore" caption="All eligible bills" icon={ArrowUpRight} chart={<BalanceSparkline balance="payables" />} />
        <StatCard label="Bills in source" value={300} caption="Posted by snapshot" icon={FileSearch} />
        <StatCard label="Pending approvals" value={51} caption="Posted payments to review" icon={ShieldAlert} attention />
      </div>
      <FinanceDashboard key={`${billId ?? vendorId ?? "ap"}-${selectedView}`} label="Payables views" views={[
        { id: "bills", label: "Bills & settlement", content: <BillExplorer billId={billId} vendorId={vendorId} /> },
        { id: "priorities", label: "Payment review", content: <BillExplorer priorities vendorId={vendorId} /> },
        { id: "ageing", label: "Ageing", content: <AgeingAnalysis ledger="ap" /> },
        { id: "period", label: "Period analysis", content: <PeriodAnalysis ledger="ap" /> },
        { id: "measures", label: "Measures", content: <AnalyticsSummary ledger="ap" /> },
      ]} initialView={billId ? "bills" : selectedView} />
    </>
  );
}
