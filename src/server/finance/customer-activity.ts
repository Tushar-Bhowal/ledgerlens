import "server-only";
import { getDatabasePool } from "@/server/db";
import { reportingDate } from "./documents";

export type CustomerActivityEvent = {
  id: string; kind: string; date: string | null; invoiceId: string | null;
  amount: string | null; status: string | null; detail: string | null;
  sourceFilename: string; sourceRecordNumber: number; warning: string | null;
  allocations: { invoiceId: string; amount: string | null; date: string | null; status: string | null; sourceFilename: string; sourceRecordNumber: number }[];
};
export type CustomerActivity = { asOf: string; events: CustomerActivityEvent[] };

export async function getCustomerActivity(customerId: string): Promise<CustomerActivity> {
  const result = await getDatabasePool().query<CustomerActivityEvent>(`
    WITH events AS (
      SELECT d.dispute_id AS id, 'Dispute'::text AS kind, d.raised_date AS date, d.invoice_id,
        d.disputed_amount_inr AS amount, d.status, d.dispute_reason AS detail,
        d.source_filename, d.source_record_number,
        CASE WHEN d.raised_date IS NULL THEN 'Missing event date'
          WHEN i.customer_id IS DISTINCT FROM d.party_id THEN 'Customer/invoice mismatch'
          WHEN i.invoice_date IS NULL OR d.raised_date < i.invoice_date THEN 'Invoice chronology requires review' END AS warning,
        '[]'::json AS allocations
      FROM finance.disputes d LEFT JOIN finance.ar_invoices i ON i.invoice_id = d.invoice_id
      WHERE d.party_type = 'Customer' AND d.party_id = $2 AND (d.raised_date <= $1::date OR d.raised_date IS NULL)
      UNION ALL
      SELECT f.followup_id, 'Follow-up', f.followup_date, f.invoice_id, f.promised_amount_inr,
        f.followup_status, concat_ws(' · ', f.contact_method, 'Owner: ' || f.owner_id,
          'Promise: ' || f.promise_to_pay_date::text, f.notes), f.source_filename, f.source_record_number,
        CASE WHEN f.followup_date IS NULL THEN 'Missing event date'
          WHEN i.customer_id IS DISTINCT FROM f.customer_id THEN 'Customer/invoice mismatch'
          WHEN i.invoice_date IS NULL OR f.followup_date < i.invoice_date OR f.promise_to_pay_date < f.followup_date THEN 'Invoice/promise chronology requires review' END,
        '[]'::json
      FROM finance.collection_followups f LEFT JOIN finance.ar_invoices i ON i.invoice_id = f.invoice_id
      WHERE f.customer_id = $2 AND (f.followup_date <= $1::date OR f.followup_date IS NULL)
      UNION ALL
      SELECT r.receipt_id, 'Receipt', r.receipt_date, NULL::text, r.receipt_amount_inr, r.status,
        concat_ws(' · ', r.receipt_reference, r.payment_mode, r.bank_reference), r.source_filename, r.source_record_number,
        CASE WHEN r.receipt_date IS NULL THEN 'Missing event date' END,
        coalesce((SELECT json_agg(json_build_object('invoiceId', a.invoice_id, 'amount', a.allocated_amount_inr::text,
          'date', a.allocation_date::text, 'status', a.status, 'sourceFilename', a.source_filename,
          'sourceRecordNumber', a.source_record_number) ORDER BY a.allocation_date, a.allocation_id)
          FROM finance.ar_receipt_allocations a WHERE a.receipt_id = r.receipt_id
            AND (a.allocation_date <= $1::date OR a.allocation_date IS NULL)), '[]'::json)
      FROM finance.ar_receipts r WHERE r.customer_id = $2 AND (r.receipt_date <= $1::date OR r.receipt_date IS NULL)
    )
    SELECT id, kind, date::text, invoice_id AS "invoiceId", amount::text, status, detail,
      source_filename AS "sourceFilename", source_record_number AS "sourceRecordNumber", warning, allocations
    FROM events ORDER BY date DESC NULLS FIRST, kind, id
  `, [reportingDate, customerId]);
  return { asOf: reportingDate, events: result.rows };
}
