import "server-only";
import { getDatabasePool } from "@/server/db";
import { reportingDate } from "./documents";
import { snapshotRowsSql } from "./snapshots";

type CustomerShortfall = {
  id: string; name: string; billing: string; cash: string; due: string; applied: string;
  adjustments: string; shortfall: string; months: number; overdue: string; closing: string;
  monthlyMovement: string | null; illustration: string | null;
};
export type CustomerShortfallMonth = {
  id: string; name: string; month: number; billing: string; cash: string; due: string;
  applied: string; adjustments: string; shortfall: string; cumulativeShortfall: string;
  overdue: string; closing: string;
};

export async function getShortPaymentCustomers(customerId?: string, selectedMonth = 12) {
  if (!Number.isInteger(selectedMonth) || selectedMonth < 1 || selectedMonth > 12) throw new RangeError("Month must be 1 through 12");
  const result = await getDatabasePool().query<{ rows: CustomerShortfall[]; history: CustomerShortfallMonth[]; complete: boolean }>(`
    WITH months AS (
      SELECT n AS month, (date_trunc('year', $1::date) + make_interval(months => n - 1))::date AS start,
        (date_trunc('year', $1::date) + make_interval(months => n) - interval '1 day')::date AS finish
      FROM generate_series(1, $3::integer) n
    ), cutoffs AS (SELECT finish AS cutoff FROM months UNION SELECT $1::date UNION SELECT (date_trunc('year', $1::date) - interval '1 day')::date), snapshots AS MATERIALIZED (
      SELECT cutoffs.cutoff, b.* FROM cutoffs CROSS JOIN LATERAL (${snapshotRowsSql("ar")}) b
    ), monthly AS (
      SELECT c.customer_id AS id, c.customer_name AS name, m.month,
        coalesce((SELECT sum(f.face) FROM snapshots f WHERE f.cutoff = $1::date AND f.party_id = c.customer_id
          AND f.date BETWEEN m.start AND m.finish), 0) AS billing,
        coalesce((SELECT sum(r.receipt_amount_inr) FROM finance.ar_receipts r
          WHERE r.customer_id = c.customer_id AND r.status = 'Posted' AND r.receipt_date BETWEEN m.start AND m.finish), 0) AS cash,
        coalesce(sum(b.face) FILTER (WHERE b.due BETWEEN m.start AND m.finish), 0) AS due,
        coalesce(sum(b.paid) FILTER (WHERE b.due BETWEEN m.start AND m.finish), 0) AS applied,
        coalesce(sum(b.adjustment) FILTER (WHERE b.due BETWEEN m.start AND m.finish), 0) AS adjustments,
        coalesce(sum(greatest(b.outstanding, 0)) FILTER (WHERE b.due BETWEEN m.start AND m.finish), 0) AS shortfall,
        coalesce(sum(greatest(b.outstanding, 0)) FILTER (WHERE b.due < m.finish), 0) AS overdue,
        coalesce(sum(b.outstanding), 0) AS closing
      FROM finance.customer_master c CROSS JOIN months m
      LEFT JOIN snapshots b ON b.cutoff = m.finish AND b.party_id = c.customer_id
      WHERE ($2::text IS NULL OR c.customer_id = $2)
      GROUP BY c.customer_id, c.customer_name, m.month, m.start, m.finish
    ), history AS (
      -- Each cohort is measured at its own month end. Later receipts do not rewrite its original shortfall.
      SELECT *, sum(shortfall) OVER (PARTITION BY id ORDER BY month) AS cumulative_shortfall FROM monthly
    ), ranked AS (
      SELECT id, name, sum(billing) AS billing, sum(cash) AS cash, sum(due) AS due,
        sum(applied) AS applied, sum(adjustments) AS adjustments, sum(shortfall) AS shortfall,
        count(*) FILTER (WHERE shortfall > 0)::integer AS months,
        max(overdue) FILTER (WHERE month = $3::integer) AS overdue,
        max(closing) FILTER (WHERE month = $3::integer) AS closing,
        CASE WHEN $3::integer >= 3 THEN (max(closing) FILTER (WHERE month = $3::integer) -
          coalesce((SELECT sum(p.outstanding) FROM snapshots p WHERE p.party_id = history.id
            AND p.cutoff = (date_trunc('year', $1::date) + make_interval(months => $3::integer - 3) - interval '1 day')::date), 0)) / 3 END AS movement
      FROM history GROUP BY id, name
    ), coverage AS (
      SELECT NOT EXISTS (SELECT 1 FROM snapshots WHERE ($2::text IS NULL OR party_id = $2)
        AND (outstanding IS NULL OR date IS NULL OR (outstanding > 0 AND due IS NULL)))
        AND NOT EXISTS (SELECT 1 FROM finance.import_issues WHERE issue_code = 'rejected')
        AND NOT EXISTS (SELECT 1 FROM finance.ar_receipts WHERE ($2::text IS NULL OR customer_id = $2)
          AND (receipt_date <= $1::date OR receipt_date IS NULL)
          AND (status IS NULL OR status NOT IN ('Posted', 'Cancelled', 'Canceled', 'Reversed', 'Voided')
            OR (status = 'Posted' AND (receipt_date IS NULL OR receipt_amount_inr IS NULL OR receipt_amount_inr < 0)))) AS complete
    )
    SELECT complete,
      CASE WHEN complete THEN coalesce((SELECT json_agg(json_build_object(
        'id', id, 'name', name, 'billing', billing::text, 'cash', cash::text, 'due', due::text,
        'applied', applied::text, 'adjustments', adjustments::text, 'shortfall', shortfall::text,
        'months', months, 'overdue', overdue::text, 'closing', closing::text,
        'monthlyMovement', round(movement, 2)::text, 'illustration', CASE WHEN movement IS NULL THEN NULL ELSE round(greatest(closing + movement, 0), 2)::text END)
        ORDER BY shortfall DESC, id) FROM ranked), '[]'::json) ELSE '[]'::json END AS rows,
      CASE WHEN complete THEN coalesce((SELECT json_agg(json_build_object(
        'id', id, 'name', name, 'month', month, 'billing', billing::text, 'cash', cash::text,
        'due', due::text, 'applied', applied::text, 'adjustments', adjustments::text,
        'shortfall', shortfall::text, 'cumulativeShortfall', cumulative_shortfall::text,
        'overdue', overdue::text, 'closing', closing::text) ORDER BY id, month) FROM history), '[]'::json) ELSE '[]'::json END AS history
    FROM coverage
  `, [reportingDate, customerId ?? null, selectedMonth]);
  return result.rows[0];
}
