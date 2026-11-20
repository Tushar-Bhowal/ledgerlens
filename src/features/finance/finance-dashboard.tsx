"use client";

import { useId, useState, type ReactNode } from "react";

type View = { id: string; label: string; content: ReactNode };

export function FinanceDashboard({ label, views, initialView }: { label: string; views: readonly View[]; initialView?: string }) {
  const [active, setActive] = useState(initialView ?? views[0].id);
  const prefix = useId();
  const selected = views.find((view) => view.id === active) ?? views[0];

  return (
    <div className="finance-dashboard">
      <div className="finance-dashboard-toolbar">
        <div className="finance-tabs" role="group" aria-label={label}>
          {views.map((view) => (
            <button
              type="button"
              key={view.id}
              aria-pressed={selected.id === view.id}
              aria-controls={prefix}
              onClick={() => setActive(view.id)}
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>
      <div id={prefix} role="region" aria-label={selected.label}>
        {selected.content}
      </div>
    </div>
  );
}
