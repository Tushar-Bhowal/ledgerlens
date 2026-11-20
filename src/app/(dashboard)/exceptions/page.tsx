import { PageHeading } from "@/components/dashboard/page-heading";
import { FinanceDashboard } from "@/features/finance/finance-dashboard";
import { CustomerAnalysis } from "@/features/receivables/customer-analysis";
import { ExceptionExplorer } from "@/features/exceptions/exception-explorer";

export default async function ExceptionsPage({ searchParams }: { searchParams: Promise<{ issue?: string | string[] }> }) {
  const { issue } = await searchParams;
  const issueId = typeof issue === "string" ? issue : undefined;

  return (
    <>
      <PageHeading title="Risk & exceptions" description="Investigate the records that need a closer look." />
      <FinanceDashboard key={issueId ?? "exceptions"} label="Risk and exceptions views" views={[
        { id: "issues", label: "Investigations", content: <ExceptionExplorer issueId={issueId} /> },
        { id: "customers", label: "Customer risk", content: <CustomerAnalysis /> },
      ]} />
    </>
  );
}
