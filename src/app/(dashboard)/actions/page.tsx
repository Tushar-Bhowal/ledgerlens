import { PageHeading } from "@/components/dashboard/page-heading";
import { Opportunities } from "@/features/finance/opportunities";
import { ActionQueue } from "@/features/actions/action-queue";
import { FinanceDashboard } from "@/features/finance/finance-dashboard";

export default async function ActionsPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const { view } = await searchParams;
  const selectedView = view === "opportunities" ? "opportunities" : "actions";
  return (
    <>
      <PageHeading title="Action queue" description="Prioritised collection follow-ups and payment-control reviews." />
      <FinanceDashboard key={selectedView} label="Action queue" initialView={selectedView} views={[
        { id: "actions", label: "Next steps", content: <ActionQueue /> },
        { id: "opportunities", label: "Collection opportunities", content: <Opportunities /> },
      ]} />
    </>
  );
}
