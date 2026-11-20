import Link from "next/link";
import { ArrowLeft, FileSearch } from "lucide-react";
import { StateMessage } from "@/components/ui/state-message";

export default function NotFound() {
  return (
    <section className="panel feedback-panel">
      <StateMessage icon={FileSearch} heading="h1" title="Record not found" description="This link doesn’t match a record in the supplied snapshot. Return to Overview to find the record you need.">
        <Link className="table-tool-button" href="/"><ArrowLeft size={16} aria-hidden="true" /> Back to Overview</Link>
      </StateMessage>
    </section>
  );
}
