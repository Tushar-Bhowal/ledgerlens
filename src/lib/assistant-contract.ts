import { z } from "zod";

export const toolNames = [
  "toolReceivablesIncrease", "toolCollectionAttention", "toolShortPayments",
  "toolCustomerRisk", "toolVendorPriorities", "toolInvestigateException", "toolDocumentEvidence",
] as const;

export const agentContextSchema = z.object({
  tool: z.enum(toolNames),
  month: z.number().int().min(1).max(12).optional(),
  customerId: z.string().regex(/^C\d{3}$/i).optional(),
  issueId: z.string().regex(/^[a-z0-9_-]{1,100}$/i).optional(),
  documentId: z.string().regex(/^(ARI|API)\d{5}$/i).optional(),
}).strict();

export type AgentContext = z.infer<typeof agentContextSchema>;
