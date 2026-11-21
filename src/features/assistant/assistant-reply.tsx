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
    <figure className="reply-figure">
      <figcaption>{figure.title}</figcaption>
      {figure.kind === "allocation" && (
        <div className="reply-allocation" aria-hidden="true">
          {figure.values.map(({ label, amount }) => <span key={label} style={{ flexGrow: amount }} />)}
        </div>
      )}
      <dl className={figure.kind === "allocation" ? "reply-facts allocation-facts" : "reply-comparison"}>
        {figure.values.map(({ label, amount }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{figure.kind === "comparison" ? inCrore(amount / rupeesPerCrore) : money(amount)}</dd>
            {figure.kind === "comparison" && (
              <dd className="reply-bar-track" aria-hidden="true"><span style={{ width: `${amount / max * 100}%` }} /></dd>
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
      {!evidenceOnly && <p className="reply-lead">{example.answer}</p>}
      <div className="reply-scope">As of 31 Dec 2025 · Starter data</div>
      {example.figure && <AnswerFigure figure={example.figure} />}
      {example.facts && (
        <dl className="reply-facts">
          {example.facts.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      )}
      {example.table && (
        <div className="reply-table">
          <h3>{example.table.title}</h3>
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
      <p className="response-note">{example.limitation}</p>
      {!evidenceOnly && <p><strong>Next step</strong> · {example.nextStep}</p>}
      {example.evidence.map(({ label, caption, href }) => (
        <Link key={href} className="evidence-link" href={href} target="_blank" rel="noopener noreferrer">
          <FileText size={17} aria-hidden="true" />
          <span><strong>{label}<span className="sr-only"> (opens in a new tab)</span></strong><small>{caption}</small></span>
          <ArrowUpRight size={16} aria-hidden="true" />
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
      <div className="reply-loading" aria-busy="true">
        <span className="reply-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>{loadingSteps[reply.step]}…</span>
      </div>
    );
  }

  if (reply.kind === "message") {
    return <div className="reply-complete"><p className="reply-lead">{reply.text}</p></div>;
  }

  if (reply.kind === "unsupported") {
    return <div className="reply-complete"><p>{reply.message ?? "The starter data does not include inventory, COGS, bank statements or GL/control balances. I cannot calculate full CCC or perform bank/GL reconciliation from this snapshot."}</p></div>;
  }

  if (reply.kind === "answer") {
    return <div className="reply-complete"><Answer example={reply.example} evidenceOnly={reply.evidenceOnly} /></div>;
  }

  if (reply.kind === "stopped" || reply.kind === "service-error" || reply.kind === "rate-limit") {
    const { title, detail } = interruptions[reply.kind];
    return (
      <div className="reply-notice">
        <StateMessage compact heading="h3" icon={reply.kind === "stopped" ? CirclePause : reply.kind === "rate-limit" ? Clock3 : CircleAlert} title={title} description={detail}>
          {onRetry && <button className="assistant-tool" type="button" onClick={onRetry} disabled={retryDisabled}><RotateCcw size={14} aria-hidden="true" /> Retry</button>}
        </StateMessage>
      </div>
    );
  }

  const clarifying = reply.kind === "clarify";
  const choices = reply.kind === "clarify" ? reply.choices : [examples[0].question, examples[1].question, examples[4].question];

  return (
    <div className="reply-complete">
      <p>{clarifying ? "Which of these would you like to investigate?" : "I could not find a specific answer for that question. Try a question below or open Examples."}</p>
      <div className="reply-choices">
        {choices.map((question) => <button type="button" className="assistant-tool follow-up" key={question} onClick={() => onChoose(question)}>{question}</button>)}
      </div>
    </div>
  );
}
