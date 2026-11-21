import { ArrowDownLeft, FileSearch, WalletCards } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { BalanceSparkline } from "@/components/dashboard/balance-sparkline";
import { PageHeading } from "@/components/dashboard/page-heading";
import { InvoiceExplorer } from "@/features/receivables/invoice-explorer";
import { FinanceDashboard } from "@/features/finance/finance-dashboard";
import { AgeingAnalysis } from "@/features/finance/ageing-analysis";
import { PeriodAnalysis } from "@/features/finance/period-analysis";
import { AnalyticsSummary } from "@/features/finance/analytics-summary";
import { CustomerAnalysis } from "@/features/receivables/customer-analysis";
import { snapshot } from "@/lib/demo-data";

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<{ invoice?: string | string[]; customer?: string | string[]; view?: string | string[]; month?: string | string[] }> }) {
  const { invoice, customer, view, month } = await searchParams;
  const invoiceId = typeof invoice === "string" ? invoice : undefined;
  const customerId = typeof customer === "string" ? customer : undefined;

  const periodMonth = typeof month === "string" && /^(?:[1-9]|1[0-2])$/.test(month) ? Number(month) : 12;

  const allowedViews = ["invoices", "customers", "ageing", "period", "measures"];
  const selectedView = typeof view === "string" && allowedViews.includes(view) ? view : "invoices";
  return (
    <>
      <PageHeading title="Receivables" description="Explore customer invoices and their allocation evidence." />
      <div className="stat-strip">
        <StatCard label="Net receivables" value={snapshot.receivablesCrore} liveKey="receivables" format="crore" caption="All eligible invoices" icon={ArrowDownLeft} chart={<BalanceSparkline balance="receivables" />} />
        <StatCard label="Invoices in source" value={600} liveKey="invoiceCount" caption="Source invoice records" icon={FileSearch} />
        <StatCard label="Unallocated receipts" value={snapshot.unallocatedReceipts} liveKey="unallocatedReceipts" format="rupees" caption="Kept separate from invoices" icon={WalletCards} attention />
      </div>
      <FinanceDashboard key={`${invoiceId ?? customerId ?? "ar"}-${selectedView}-${periodMonth}`} label="Receivables views" views={[
        { id: "invoices", label: "Invoices", content: <InvoiceExplorer invoiceId={invoiceId} /> },
        { id: "customers", label: "Customers & risk", content: <CustomerAnalysis customerId={customerId} /> },
        { id: "ageing", label: "Ageing", content: <AgeingAnalysis ledger="ar" /> },
        { id: "period", label: "Period analysis", content: <PeriodAnalysis ledger="ar" initialMonth={periodMonth} /> },
        { id: "measures", label: "Measures", content: <AnalyticsSummary ledger="ar" /> },
      ]} initialView={invoiceId ? "invoices" : customerId ? "customers" : selectedView} />
    </>
  );
}
