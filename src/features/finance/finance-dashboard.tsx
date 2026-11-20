"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { CircleAlert, FileQuestion, Inbox, RotateCcw } from "lucide-react";
import { DataTableSkeleton, Skeleton } from "@/components/ui/loading-skeletons";
import { StateMessage } from "@/components/ui/state-message";

type View = { id: string; label: string; content: ReactNode };
type State = "ready" | "loading" | "empty" | "error" | "unavailable";

export function FinanceDashboard({ label, views, initialView }: { label: string; views: readonly View[]; initialView?: string }) {
  const [active, setActive] = useState(initialView ?? views[0].id);
  const [state, setState] = useState<State>("ready");
  const prefix = useId();
  const stateSelect = useRef<HTMLSelectElement>(null);
  const selected = views.find((view) => view.id === active) ?? views[0];

  return (
    <div className="finance-dashboard">
      <div className="finance-dashboard-toolbar">
        <div className="finance-tabs" role="group" aria-label={label}>
          {views.map((view) => (
            <button type="button" key={view.id} aria-pressed={selected.id === view.id} aria-controls={prefix} onClick={() => setActive(view.id)}>{view.label}</button>
          ))}
        </div>
        <label className="preview-state-select">
          Preview state
          <select ref={stateSelect} value={state} onChange={(event) => setState(event.target.value as State)}>
            <option value="ready">Ready</option>
            <option value="loading">Loading</option>
            <option value="empty">Empty</option>
            <option value="error">Error</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
      </div>
      <div id={prefix} role="region" aria-label={selected.label}>
        {state === "ready" ? selected.content : state === "loading" ? (
          <section className="panel finance-panel">
            <span className="sr-only" role="status">Loading {selected.label}</span>
            <div aria-hidden="true"><Skeleton className="skeleton-title" /><DataTableSkeleton columns={5} rows={5} /></div>
          </section>
        ) : (
          <section className="panel feedback-panel">
            <StateMessage
              icon={state === "empty" ? Inbox : state === "error" ? CircleAlert : FileQuestion}
              title={state === "empty" ? "No records in this view" : state === "error" ? "We couldn’t load this view" : "This analysis needs more data"}
              description={state === "empty" ? "Try another scope or return to the prepared records." : state === "error" ? "Simulated loading failure. Retry to restore the prepared view." : "This preview shows how missing inputs will appear. Return to the prepared view to explore the available records."}
            >
              <button className="table-tool-button" type="button" onClick={() => { setState("ready"); stateSelect.current?.focus(); }}><RotateCcw size={16} aria-hidden="true" />{state === "error" ? "Try again" : "Return to preview"}</button>
            </StateMessage>
          </section>
        )}
      </div>
    </div>
  );
}
