import "server-only";
import { getDatabasePool } from "@/server/db";
import { documentBalancesSql, reportingDate } from "./documents";

export async function getCustomerPriorities(customerId?: string) {
  // Use the AR invoice balances behind the invoice table as the starting point for every customer.
  const result = await getDatabasePool().query<{ rows: unknown[]; rejectedRows: number }>(`
    WITH ${documentBalancesSql("ar")},
    disputes AS (
      -- Only dated, unresolved disputes with a matching customer can reduce the collection portion.
      SELECT d.invoice_id,
        SUM(CASE WHEN d.party_id = i.customer_id AND d.status IN ('Open', 'Under Review')
          AND d.raised_date BETWEEN i.invoice_date AND $1::date
          AND d.disputed_amount_inr >= 0 THEN d.disputed_amount_inr ELSE 0 END) AS amount,
        BOOL_OR(d.party_id <> i.customer_id OR d.status IS NULL
          OR d.status NOT IN ('Open', 'Under Review', 'Resolved', 'Closed')
          OR (d.status IN ('Open', 'Under Review') AND
            (d.raised_date IS NULL OR i.invoice_date IS NULL OR d.disputed_amount_inr IS NULL OR d.disputed_amount_inr < 0))) AS incomplete
      FROM finance.disputes d
      JOIN finance.ar_invoices i ON i.invoice_id = d.invoice_id
      WHERE d.party_type = 'Customer'
      GROUP BY d.invoice_id
    ),
    customer_balances AS (
      -- Cap each disputed amount at that invoice's overdue balance before adding customer totals.
      SELECT b.party_id, b.party,
        SUM(GREATEST(b.outstanding, 0)) AS outstanding,
        SUM(CASE WHEN b.status = 'overdue' THEN b.outstanding ELSE 0 END) AS overdue,
        SUM(CASE WHEN b.status = 'overdue' THEN LEAST(b.outstanding, COALESCE(d.amount, 0)) ELSE 0 END) AS disputed,
        MAX(CASE WHEN b.status = 'overdue' THEN $1::date - b.due ELSE 0 END)::integer AS oldest_days,
        BOOL_OR(b.outstanding IS NULL OR (b.outstanding > 0 AND b.due IS NULL) OR COALESCE(d.incomplete, false)) AS incomplete
      FROM balances b
      LEFT JOIN disputes d ON d.invoice_id = b.id
      GROUP BY b.party_id, b.party
    ),
    broken_promises AS (
      -- A promise counts only when the follow-up is on or after the invoice date and by the cutoff.
      SELECT DISTINCT f.customer_id
      FROM finance.collection_followups f
      JOIN balances b ON b.id = f.invoice_id AND b.party_id = f.customer_id
      WHERE f.followup_status = 'Promise Broken'
        AND f.followup_date BETWEEN b.date AND $1::date
        AND f.promise_to_pay_date BETWEEN f.followup_date AND $1::date
        AND b.status = 'overdue'
    ),
    payment_days AS (
      -- Weight each payment's elapsed days by its allocated amount, rather than counting each equally.
      SELECT b.party_id, SUM(a.allocated_amount_inr * (a.allocation_date - b.date))
        / NULLIF(SUM(a.allocated_amount_inr), 0) AS days
      FROM balances b
      JOIN allocation_totals t ON t.document_id = b.id AND NOT t.invalid
      JOIN finance.ar_receipt_allocations a ON a.invoice_id = b.id
      JOIN finance.ar_receipts r ON r.receipt_id = a.receipt_id AND r.customer_id = b.party_id
      WHERE b.date IS NOT NULL AND a.status = 'Allocated' AND r.status = 'Posted'
        AND a.allocation_date BETWEEN b.date AND $1::date
        AND r.receipt_date <= $1::date AND a.allocated_amount_inr > 0
      GROUP BY b.party_id
    ),
    customer_results AS (
    -- High-risk signals come first, followed by collection amount, oldest debt and payment days.
    SELECT row_number() OVER (
        ORDER BY b.incomplete ASC,
          (b.oldest_days > 90 OR COALESCE(c.credit_limit_inr > 0 AND b.outstanding > c.credit_limit_inr, false) OR f.customer_id IS NOT NULL) DESC,
          (b.overdue - b.disputed) DESC, b.oldest_days DESC, p.days DESC NULLS LAST, c.customer_id
      ) AS rank,
      c.customer_id AS id, c.customer_name AS name, c.parent_group AS "group", c.region,
      CASE WHEN b.incomplete THEN NULL ELSE coalesce(b.outstanding, 0)::text END AS outstanding,
      CASE WHEN b.incomplete THEN NULL ELSE coalesce(b.overdue, 0)::text END AS overdue,
      CASE WHEN b.incomplete THEN NULL ELSE coalesce(b.disputed, 0)::text END AS disputed,
      CASE WHEN b.incomplete THEN NULL ELSE (coalesce(b.overdue, 0) - coalesce(b.disputed, 0))::text END AS actionable,
      coalesce(b.oldest_days, 0) AS "oldestDays", c.credit_limit_inr::text AS "limit",
      p.days::text AS "paymentDays",
      CASE WHEN b.incomplete THEN 'Incomplete'
        WHEN b.oldest_days > 90 OR (c.credit_limit_inr > 0 AND b.outstanding > c.credit_limit_inr) OR f.customer_id IS NOT NULL THEN 'High'
        ELSE 'Review' END AS priority,
      array_remove(ARRAY[
        CASE WHEN b.incomplete THEN 'Some balances or due dates are unavailable' END,
        CASE WHEN b.oldest_days > 90 THEN 'Over 90 days past due' END,
        CASE WHEN c.credit_limit_inr > 0 AND b.outstanding > c.credit_limit_inr THEN 'Above current credit limit' END,
        CASE WHEN f.customer_id IS NOT NULL THEN 'Valid broken promise' END
      ], NULL) AS reasons
    FROM finance.customer_master c
    LEFT JOIN customer_balances b ON c.customer_id = b.party_id
    LEFT JOIN broken_promises f ON f.customer_id = c.customer_id
    LEFT JOIN payment_days p ON p.party_id = c.customer_id
    WHERE ($2::text IS NOT NULL AND c.customer_id = $2)
      OR ($2::text IS NULL AND (b.overdue > 0 OR b.incomplete))
    ORDER BY b.incomplete ASC,
      (b.oldest_days > 90 OR COALESCE(c.credit_limit_inr > 0 AND b.outstanding > c.credit_limit_inr, false) OR f.customer_id IS NOT NULL) DESC,
      (b.overdue - b.disputed) DESC, b.oldest_days DESC, p.days DESC NULLS LAST, c.customer_id
    )
    SELECT COALESCE(json_agg(customer_results ORDER BY rank), '[]'::json) AS rows,
      (SELECT COUNT(*)::integer FROM finance.import_issues WHERE issue_code = 'rejected') AS "rejectedRows"
    FROM customer_results
  `, [reportingDate, customerId ?? null]);
  return { asOf: reportingDate, rows: result.rows[0].rows, rejectedRows: result.rows[0].rejectedRows };
}
