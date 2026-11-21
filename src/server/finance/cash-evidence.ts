import "server-only";
import { getDatabasePool } from "@/server/db";
import { reportingDate } from "./documents";
import { cashBalancesSql } from "./summary";

export type CashEvidence = {
  asOf: string;
  ledger: "ar" | "ap";
  id: string;
  reference: string | null;
  partyId: string;
  party: string;
  date: string | null;
  amount: string | null;
  method: string | null;
  bankReference: string | null;
  status: string | null;
  approval: string | null;
  sourceFilename: string;
  sourceRecordNumber: number;
  applied: string | null;
  unallocated: string | null;
  rejectedRows: number;
  allocations: {
    id: string; documentId: string; date: string | null; amount: string | null;
    status: string | null; sourceFilename: string; sourceRecordNumber: number;
  }[];
};

export async function getCashEvidence(id: string): Promise<CashEvidence | null> {
  if (!/^(ARR|APP)\d{5}$/i.test(id)) throw new Error("Invalid cash reference.");
  const ledger = id.toUpperCase().startsWith("ARR") ? "ar" : "ap";
  const ar = ledger === "ar";
  const cashId = ar ? "receipt_id" : "payment_id";
  const header = ar ? "ar_receipts" : "ap_payments";
  const allocation = ar ? "ar_receipt_allocations" : "ap_payment_allocations";
  const partyId = ar ? "customer_id" : "vendor_id";
  const result = await getDatabasePool().query<Omit<CashEvidence, "asOf" | "ledger">>(`
    WITH ${cashBalancesSql(ledger)}, coverage AS (
      SELECT count(*)::integer AS rejected FROM finance.import_issues WHERE issue_code = 'rejected'
    )
    SELECT h.${cashId} AS id, h.${ar ? "receipt_reference" : "payment_reference"} AS reference,
      h.${partyId} AS "partyId", m.${ar ? "customer_name" : "vendor_name"} AS party,
      h.${ar ? "receipt_date" : "payment_date"}::text AS date,
      h.${ar ? "receipt_amount_inr" : "payment_amount_inr"}::text AS amount,
      h.${ar ? "payment_mode" : "payment_method"} AS method, h.bank_reference AS "bankReference", h.status,
      ${ar ? "NULL::text" : "h.approval_status"} AS approval,
      h.source_filename AS "sourceFilename", h.source_record_number AS "sourceRecordNumber",
      CASE WHEN coverage.rejected = 0 AND c.unallocated IS NOT NULL THEN c.applied::text END AS applied,
      CASE WHEN coverage.rejected = 0 THEN c.unallocated::text END AS unallocated,
      coverage.rejected AS "rejectedRows",
      coalesce((SELECT json_agg(json_build_object('id', a.allocation_id,
        'documentId', a.${ar ? "invoice_id" : "bill_id"}, 'date', a.allocation_date::text,
        'amount', a.allocated_amount_inr::text, 'status', a.status,
        'sourceFilename', a.source_filename, 'sourceRecordNumber', a.source_record_number)
        ORDER BY a.allocation_date NULLS FIRST, a.allocation_id)
        FROM finance.${allocation} a WHERE a.${cashId} = h.${cashId}), '[]'::json) AS allocations
    FROM finance.${header} h JOIN finance.${ar ? "customer_master" : "vendor_master"} m USING (${partyId})
    CROSS JOIN coverage LEFT JOIN cash_balances c ON c.id = h.${cashId}
    WHERE h.${cashId} = $2
  `, [reportingDate, id.toUpperCase()]);
  return result.rows[0] ? { ...result.rows[0], ledger, asOf: reportingDate } : null;
}
