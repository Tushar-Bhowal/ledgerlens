import Link from "next/link";
import { ArrowUpRight, CircleAlert, CirclePause, Clock3, FileText, RotateCcw } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StateMessage } from "@/components/ui/state-message";
import { inCrore, money, rupeesPerCrore } from "@/lib/demo-data";
import { examples, type PreviewExample } from "./examples";
import { loadingSteps, type PreviewReply } from "./preview-conversation";

function AnswerFigure({ figure }: { figure: NonNullable<PreviewExample["figure"]> }) {
  const max = Math.max(1, ...figure.values.map(({ amount }) => amount));
  return (
    <figure className="grid gap-2.5 p-3 bg-card border border-border rounded-xl">
      <figcaption className="text-[13px] font-semibold text-foreground">{figure.title}</figcaption>
      {figure.kind === "allocation" && (
        <div className="flex h-1.5 gap-0.5 rounded-full overflow-hidden" aria-hidden="true">
          {figure.values.map(({ label, amount }, idx) => (
            <span
              key={label}
              className={idx === 0 ? "h-full bg-primary rounded-sm" : "h-full bg-amber-500 rounded-sm"}
              style={{ flexGrow: amount }}
            />
          ))}
        </div>
      )}
      <dl className="grid gap-2 text-xs">
        {figure.values.map(({ label, amount }) => (
          <div key={label} className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 items-start">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right tabular-nums font-medium text-foreground">
              {figure.kind === "comparison" ? inCrore(amount / rupeesPerCrore) : money(amount)}
            </dd>
            {figure.kind === "comparison" && (
              <dd className="col-span-full h-1.5 bg-muted rounded-full overflow-hidden" aria-hidden="true">
                <span className="block h-full bg-primary rounded-full transition-all" style={{ width: `${(amount / max) * 100}%` }} />
              </dd>
            )}
          </div>
        ))}
      </dl>
    </figure>
  );
}

function Answer({ example, evidenceOnly }: { example: PreviewExample; evidenceOnly: boolean }) {
  return (
    <>
      {!evidenceOnly && <p className="font-medium text-foreground text-sm leading-relaxed">{example.answer}</p>}
      <div className="text-xs text-muted-foreground">As of 31 Dec 2025 · Starter data</div>
      {example.figure && <AnswerFigure figure={example.figure} />}
      {example.facts && (
        <dl className="grid gap-1.5 text-xs">
          {example.facts.map(({ label, value }) => (
            <div key={label} className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 items-start">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right tabular-nums font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {example.table && (
        <div className="grid gap-2 mt-1">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{example.table.title}</h3>
          <DataTable<NonNullable<PreviewExample["table"]>["rows"][number]>
            label={example.table.title}
            rows={example.table.rows}
            getRowKey={(row) => row.id}
            columns={example.table.columns.map((label, index) => ({
              id: String(index),
              label,
              cell: (row) => index === 0 ? <Link className="text-link" href={row.href} target="_blank" rel="noopener noreferrer">{row.values[index]}<span className="sr-only"> (opens in a new tab)</span></Link> : row.values[index],
            }))}
            density="compact"
            pageSize={false}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground leading-normal">{example.limitation}</p>
      {!evidenceOnly && <p className="text-sm"><strong>Next step</strong> · {example.nextStep}</p>}
      {example.evidence.map(({ label, caption, href }) => (
        <Link
          key={href}
          className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 w-full max-w-[410px] mt-1 px-3 py-2.5 bg-card hover:bg-[var(--button-surface)] border border-border hover:border-[var(--button-border)] rounded-xl transition-colors"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <FileText size={17} className="text-muted-foreground" aria-hidden="true" />
          <span>
            <strong className="block text-[13px] font-semibold text-foreground">{label}<span className="sr-only"> (opens in a new tab)</span></strong>
            <small className="block text-xs text-muted-foreground">{caption}</small>
          </span>
          <ArrowUpRight size={16} className="text-muted-foreground" aria-hidden="true" />
        </Link>
      ))}
    </>
  );
}

const interruptions = {
  stopped: { title: "Response stopped", detail: "Try again when you’re ready." },
  "service-error": { title: "Service unavailable", detail: "The assistant could not retrieve the live result. Please retry." },
  "rate-limit": { title: "Request limit reached", detail: "Please wait a minute before sending another question." },
};

export function AssistantReply({ reply, onChoose, onRetry, retryDisabled }: {
  reply: PreviewReply;
  onChoose: (question: string) => void;
  onRetry?: () => void;
  retryDisabled: boolean;
}) {
  if (reply.kind === "loading") {
    return (
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-[13px] text-muted-foreground bg-card border border-border rounded-xl" aria-busy="true">
        <span className="inline-flex gap-1 text-accent-foreground" aria-hidden="true">
          <i className="size-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
          <i className="size-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
          <i className="size-1.5 bg-current rounded-full animate-bounce" />
        </span>
        <span>{loadingSteps[reply.step]}…</span>
      </div>
    );
  }

  if (reply.kind === "message") {
    return <div className="grid gap-2.5 animate-in fade-in duration-200"><p className="font-medium text-foreground text-sm leading-relaxed">{reply.text}</p></div>;
  }

  if (reply.kind === "unsupported") {
    return <div className="grid gap-2.5 animate-in fade-in duration-200"><p className="text-sm leading-relaxed text-muted-foreground">{reply.message ?? "The starter data does not include inventory, COGS, bank statements or GL/control balances. I cannot calculate full CCC or perform bank/GL reconciliation from this snapshot."}</p></div>;
  }

  if (reply.kind === "answer") {
    return <div className="grid gap-2.5 animate-in fade-in duration-200"><Answer example={reply.example} evidenceOnly={reply.evidenceOnly} /></div>;
  }

  if (reply.kind === "stopped" || reply.kind === "service-error" || reply.kind === "rate-limit") {
    const { title, detail } = interruptions[reply.kind];
    return (
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <StateMessage compact heading="h3" icon={reply.kind === "stopped" ? CirclePause : reply.kind === "rate-limit" ? Clock3 : CircleAlert} title={title} description={detail}>
          {onRetry && (
            <button
              className="inline-flex items-center gap-1.5 min-h-[32px] px-2.5 rounded-lg text-xs font-medium text-accent-foreground bg-[var(--button-surface)] border border-[var(--button-border)] hover:bg-[var(--button-surface-hover)] hover:border-primary cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
              type="button"
              onClick={onRetry}
              disabled={retryDisabled}
            >
              <RotateCcw size={14} aria-hidden="true" /> Retry
            </button>
          )}
        </StateMessage>
      </div>
    );
  }

  const clarifying = reply.kind === "clarify";
  const choices = reply.kind === "clarify" ? reply.choices : [examples[0].question, examples[1].question, examples[4].question];

  return (
    <div className="grid gap-2.5 animate-in fade-in duration-200">
      <p className="text-sm leading-relaxed text-foreground">{clarifying ? "Which of these would you like to investigate?" : "I could not find a specific answer for that question. Try a question below or open Examples."}</p>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {choices.map((question) => (
          <button
            type="button"
            className="inline-flex items-center min-h-[34px] px-3 py-1.5 rounded-full text-xs font-medium text-accent-foreground bg-[var(--button-surface)] border border-[var(--button-border)] hover:bg-[var(--button-surface-hover)] hover:border-primary cursor-pointer transition-colors max-w-full text-left break-words"
            key={question}
            onClick={() => onChoose(question)}
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
