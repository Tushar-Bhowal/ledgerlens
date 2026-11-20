import "server-only";
import {
  toolReceivablesIncrease,
  toolCollectionAttention,
  toolShortPayments,
  toolCustomerRisk,
  toolVendorPriorities,
  toolInvestigateException,
} from "./tools";
import type { PreviewReply } from "@/features/assistant/preview-conversation";
import { examples, followUp } from "@/features/assistant/examples";

function normalize(text: string) {
  return text.trim().toLowerCase().replace(/[.!?,]+/g, "").replace(/\s+/g, " ");
}

const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "toolReceivablesIncrease",
      description: "Analyzes why accounts receivable balances are increasing between months, comparing billing vs cash collections, opening-to-closing movements, top customer contributors, and ageing bucket changes.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "toolCollectionAttention",
      description: "Ranks customers requiring immediate collection attention based on overdue age, credit limit breaches, broken promises, and disputes. Separates actionable cash from disputed amounts.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "toolShortPayments",
      description: "Identifies customers who pay less than they are billed across due cohorts, tracking cohort shortfalls and cumulative overdue build-up.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "toolCustomerRisk",
      description: "Performs a deep-dive investigation into a specific customer's risk profile, terms, credit limit utilisation, invoice history, payment turnaround days, and observed warning signals.",
      parameters: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "The customer ID to inspect, e.g. C028, C018, C017." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "toolVendorPriorities",
      description: "Prioritises supplier bill payments based on due dates, vendor criticality, MSME statutory deadlines, payment terms, and approval status, while identifying blocked controls.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "toolInvestigateException",
      description: "Investigates financial exceptions such as duplicate invoices, unapproved payments, unallocated receipts, credit limit breaches, or missing purchase controls.",
      parameters: {
        type: "object",
        properties: {
          issueId: { type: "string", description: "The specific issue ID or reference to investigate, e.g. REF-BILL-00021, LIMIT-C028, STALE-ARI00331." },
        },
        required: [],
      },
    },
  },
];

async function callLlmToolCalling(question: string): Promise<PreviewReply | null> {
  const apiKey =
    process.env.GROQ_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!apiKey) return null;

  let endpoint = "https://api.groq.com/openai/v1/chat/completions";
  let model = "llama-3.3-70b-versatile";

  if (process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
    endpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    model = "gemini-2.5-flash";
  } else if (process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY) {
    endpoint = "https://api.openai.com/v1/chat/completions";
    model = "gpt-4o-mini";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are the DDL Labs Finance Working Capital Intelligence Agent. Classify user queries and invoke the appropriate financial tool. Reporting cutoff is 31 December 2025 in INR.",
          },
          { role: "user", content: question },
        ],
        tools: AGENT_TOOLS,
        tool_choice: "auto",
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!response.ok) return null;

    type ToolCall = {
      function?: {
        name: string;
        arguments?: string;
      };
    };

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          tool_calls?: ToolCall[];
        };
      }>;
    };

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.name) return null;

    const fnName = toolCall.function.name;
    let args: Record<string, string> = {};
    try {
      if (toolCall.function.arguments) {
        args = JSON.parse(toolCall.function.arguments) as Record<string, string>;
      }
    } catch {
      // Arguments parsing fallback
    }

    if (fnName === "toolReceivablesIncrease") {
      const example = await toolReceivablesIncrease();
      return { kind: "answer", example, evidenceOnly: false };
    }
    if (fnName === "toolCollectionAttention") {
      const example = await toolCollectionAttention();
      return { kind: "answer", example, evidenceOnly: false };
    }
    if (fnName === "toolShortPayments") {
      const example = await toolShortPayments();
      return { kind: "answer", example, evidenceOnly: false };
    }
    if (fnName === "toolCustomerRisk") {
      const example = await toolCustomerRisk(args.customerId);
      return { kind: "answer", example, evidenceOnly: false };
    }
    if (fnName === "toolVendorPriorities") {
      const example = await toolVendorPriorities();
      return { kind: "answer", example, evidenceOnly: false };
    }
    if (fnName === "toolInvestigateException") {
      const example = await toolInvestigateException(args.issueId);
      return { kind: "answer", example, evidenceOnly: false };
    }

    return null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function processAgentMessage(
  question: string,
  lastExampleId?: string
): Promise<PreviewReply> {
  const norm = normalize(question);

  // 1. Follow-up handling ("Show source evidence", "Show the invoices", etc.)
  const followUps = [
    normalize(followUp),
    "show me the source",
    "show me the invoices",
    "show the linked records",
    "what is the evidence",
    "show evidence",
  ];
  if (followUps.some((f) => norm === f || norm.includes(f))) {
    if (lastExampleId) {
      const match = examples.find((e) => e.id === lastExampleId);
      if (match) {
        return { kind: "answer", example: match, evidenceOnly: true };
      }
    }
    return { kind: "clarify", choices: [examples[1].question, examples[5].question] };
  }

  // 2. Ambiguous query clarification
  if (
    norm.includes("show overdue balances") ||
    norm.includes("what is overdue") ||
    norm.includes("show overdue")
  ) {
    return {
      kind: "clarify",
      choices: [
        "Who needs collection attention today?",
        "Which vendor payments should be prioritised?",
      ],
    };
  }

  // 3. Try LLM function calling if configured
  const llmResult = await callLlmToolCalling(question);
  if (llmResult) return llmResult;

  // 4. Deterministic tool router (guaranteed zero-downtime offline & evaluation mode)
  // Scenario 1: Receivables Increasing / Trend
  if (
    (norm.includes("receivable") && (norm.includes("increas") || norm.includes("grow") || norm.includes("trend") || norm.includes("chang") || norm.includes("compare"))) ||
    norm.includes("why are receivables increasing") ||
    norm.includes("compare november and december")
  ) {
    const example = await toolReceivablesIncrease();
    return { kind: "answer", example, evidenceOnly: false };
  }

  // Scenario 2: Who needs collection attention today?
  if (
    norm.includes("collection attention") ||
    norm.includes("chase for payment") ||
    norm.includes("who needs collection") ||
    norm.includes("collection priorities") ||
    (norm.includes("collection") && norm.includes("today"))
  ) {
    const example = await toolCollectionAttention();
    return { kind: "answer", example, evidenceOnly: false };
  }

  // Scenario 3: Who pays less than they are billed? / Short payments
  if (
    norm.includes("less than they are billed") ||
    norm.includes("short payment") ||
    norm.includes("underpaid") ||
    norm.includes("partial payment") ||
    norm.includes("pays less") ||
    norm.includes("shortfall")
  ) {
    const example = await toolShortPayments();
    return { kind: "answer", example, evidenceOnly: false };
  }

  // Scenario 4: Why is this customer high risk?
  if (
    norm.includes("high risk") ||
    norm.includes("customer risk") ||
    norm.includes("risky customer") ||
    norm.includes("why is this customer")
  ) {
    const matchCust = norm.match(/\b(c\d{3})\b/i);
    const customerId = matchCust ? matchCust[1].toUpperCase() : undefined;
    const example = await toolCustomerRisk(customerId);
    return { kind: "answer", example, evidenceOnly: false };
  }

  // Scenario 5: Which vendor payments should be prioritised?
  if (
    norm.includes("vendor payment") ||
    norm.includes("supplier payment") ||
    (norm.includes("vendor") && norm.includes("priorit")) ||
    (norm.includes("supplier") && norm.includes("priorit")) ||
    norm.includes("payment priorities") ||
    norm.includes("which vendor payments")
  ) {
    const example = await toolVendorPriorities();
    return { kind: "answer", example, evidenceOnly: false };
  }

  // Scenario 6: Investigate a financial exception
  if (
    norm.includes("exception") ||
    norm.includes("investigate") ||
    norm.includes("mismatch") ||
    norm.includes("unusual") ||
    norm.includes("duplicate")
  ) {
    const matchIssue = norm.match(/\b(bill-\d+|ref-bill-\d+|limit-c\d+|stale-ari\d+|arr\d+)\b/i);
    const issueId = matchIssue ? matchIssue[1].toUpperCase() : undefined;
    const example = await toolInvestigateException(issueId);
    return { kind: "answer", example, evidenceOnly: false };
  }

  // Match against existing aliases
  for (const ex of examples) {
    if (
      norm.includes(normalize(ex.question)) ||
      ex.aliases.some((a) => norm.includes(normalize(a)))
    ) {
      if (ex.id === "receivables") return { kind: "answer", example: await toolReceivablesIncrease(), evidenceOnly: false };
      if (ex.id === "collections") return { kind: "answer", example: await toolCollectionAttention(), evidenceOnly: false };
      if (ex.id === "short-payments") return { kind: "answer", example: await toolShortPayments(), evidenceOnly: false };
      if (ex.id === "customer-risk") return { kind: "answer", example: await toolCustomerRisk(), evidenceOnly: false };
      if (ex.id === "vendor-payments") return { kind: "answer", example: await toolVendorPriorities(), evidenceOnly: false };
      if (ex.id === "exception") return { kind: "answer", example: await toolInvestigateException(), evidenceOnly: false };
    }
  }

  // If completely unknown, offer choices
  return {
    kind: "clarify",
    choices: [
      "Why are receivables increasing?",
      "Who needs collection attention today?",
      "Who pays less than they are billed?",
      "Why is this customer high risk?",
      "Which vendor payments should be prioritised?",
      "Investigate a financial exception",
    ],
  };
}
