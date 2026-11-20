"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { StateMessage } from "@/components/ui/state-message";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <section className="panel feedback-panel">
      <StateMessage icon={CircleAlert} heading="h1" role="alert" title="This page couldn’t load" description="Try again, or use the navigation to open another page.">
        <button type="button" className="table-tool-button" onClick={reset}><RotateCcw size={16} aria-hidden="true" /> Try again</button>
      </StateMessage>
    </section>
  );
}
