import "server-only";
import { getDatabasePool } from "@/server/db";
import { documentBalancesSql, reportingDate } from "./documents";

export async function getFinanceSummary() {
  // Keep both ledger totals in one database snapshot. A missing balance makes the total unavailable.
  const result = await getDatabasePool().query(`
    WITH ar AS (
      WITH ${documentBalancesSql("ar")}
      SELECT CASE WHEN bool_or(outstanding IS NULL) THEN NULL ELSE COALESCE(sum(outstanding), 0) END AS total
      FROM balances
    ), ap AS (
      WITH ${documentBalancesSql("ap")}
      SELECT CASE WHEN bool_or(outstanding IS NULL) THEN NULL ELSE COALESCE(sum(outstanding), 0) END AS total
      FROM balances
    ), receipt_allocations AS (
      SELECT r.receipt_id, r.receipt_amount_inr,
        COALESCE(sum(a.allocated_amount_inr) FILTER (
          WHERE a.status = 'Allocated' AND a.allocation_date <= $1::date
            AND i.status = 'Posted' AND i.posting_date <= $1::date
        ), 0) AS applied,
        COALESCE(bool_or(
          a.allocation_id IS NOT NULL AND (
            a.status IS NULL OR a.status NOT IN ('Allocated', 'Cancelled', 'Canceled', 'Reversed', 'Voided')
            OR (a.status = 'Allocated' AND (
              a.allocation_date IS NULL OR a.allocated_amount_inr IS NULL OR a.allocated_amount_inr < 0
              OR i.customer_id <> r.customer_id OR i.status IS NULL OR i.posting_date IS NULL
              OR a.allocation_date < r.receipt_date OR a.allocation_date < i.posting_date
              OR (a.allocation_date <= $1::date AND (i.status IS DISTINCT FROM 'Posted' OR i.posting_date > $1::date))
            ))
          )
        ), false) AS invalid
      FROM finance.ar_receipts r
      LEFT JOIN finance.ar_receipt_allocations a ON a.receipt_id = r.receipt_id
      LEFT JOIN finance.ar_invoices i ON i.invoice_id = a.invoice_id
      WHERE r.status = 'Posted' AND r.receipt_date <= $1::date
      GROUP BY r.receipt_id, r.receipt_amount_inr
    ), unallocated AS (
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM finance.ar_receipts
        WHERE status IS NULL OR status NOT IN ('Posted', 'Cancelled', 'Canceled', 'Reversed', 'Voided')
          OR (status = 'Posted' AND (receipt_date IS NULL OR receipt_amount_inr IS NULL OR receipt_amount_inr < 0))
      ) OR COALESCE(bool_or(invalid OR applied > receipt_amount_inr), false) THEN NULL
        ELSE COALESCE(sum(receipt_amount_inr - applied), 0) END AS total
      FROM receipt_allocations
    ), coverage AS (
      SELECT count(*) FILTER (WHERE issue_code = 'rejected') AS rejected
      FROM finance.import_issues
    )
    SELECT CASE WHEN coverage.rejected > 0 THEN NULL ELSE ar.total::text END AS receivables,
      CASE WHEN coverage.rejected > 0 THEN NULL ELSE ap.total::text END AS payables,
      CASE WHEN coverage.rejected > 0 THEN NULL ELSE (ar.total - ap.total)::text END AS "netTradeBalance",
      CASE WHEN coverage.rejected > 0 THEN NULL ELSE unallocated.total::text END AS "unallocatedReceipts",
      CASE WHEN coverage.rejected > 0 THEN NULL ELSE (SELECT count(*)::integer FROM finance.ar_invoices) END AS "invoiceCount",
      CASE WHEN coverage.rejected > 0 THEN NULL ELSE (SELECT count(*)::integer FROM finance.ap_invoices) END AS "billCount",
      CASE WHEN coverage.rejected > 0 OR EXISTS (
        SELECT 1 FROM finance.ap_payments WHERE status IS NULL
          OR (status = 'Posted' AND (payment_date IS NULL OR approval_status IS NULL))
      ) THEN NULL ELSE (SELECT count(*)::integer FROM finance.ap_payments
        WHERE status = 'Posted' AND approval_status = 'Pending' AND payment_date <= $1::date) END AS "pendingApprovals",
      coverage.rejected::integer AS "rejectedRows"
    FROM ar CROSS JOIN ap CROSS JOIN unallocated CROSS JOIN coverage
  `, [reportingDate]);
  return { asOf: reportingDate, ...result.rows[0] };
}
