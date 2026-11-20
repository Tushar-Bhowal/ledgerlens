import { PageHeading } from "@/components/dashboard/page-heading";
import { Overview } from "@/features/overview/overview";

export default function OverviewPage() {
  return (
    <>
      <PageHeading title="Working capital overview" />
      <Overview />
    </>
  );
}
