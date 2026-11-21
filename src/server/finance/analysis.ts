import "server-only";
import { getDatabasePool } from "@/server/db";
import { reportingDate, type Ledger } from "./documents";
import { snapshotRowsSql } from "./snapshots";

type Amount = string | null;
type Movement = { opening: Amount; posted: Amount; applied: Amount; adjustments: Amount; closing: Amount };
type Cohort = { month: number; billing: Amount; cash: Amount; applied: Amount; face: Amount; settled: Amount; adjustments: Amount; unpaid: Amount; cumulativeShortfall: Amount };

export type PeriodAnalysisResult = Movement & {
  asOf: string;
  month: number;
  daily: (Movement & { date: string })[];
  cohorts: Cohort[];
  contributors: { id: string; name: string; change: Amount }[];
  ageingChanges: { label: string; opening: Amount; closing: Amount; change: Amount }[];
  projection: { closing: Amount; monthlyMovement: Amount; illustration: Amount; start: string; end: string } | null;
  rejectedRows: number;
  complete: boolean;
};

export async function getPeriodAnalysis(ledger: Ledger, selectedMonth: number): Promise<PeriodAnalysisResult> {
  if (!Number.isInteger(selectedMonth) || selectedMonth < 1 || selectedMonth > 12) throw new RangeError("Month must be an integer from 1 to 12");
  const ar = ledger === "ar";
  const cashTable = ar ? "ar_receipts" : "ap_payments";
  const cashDate = ar ? "receipt_date" : "payment_date";
  const cashAmount = ar ? "receipt_amount_inr" : "payment_amount_inr";
  const result = await getDatabasePool().query<PeriodAnalysisResult>(`
    WITH settings AS (
      SELECT date_trunc('year', $1::date)::date AS year_start,
        (date_trunc('year', $1::date) + make_interval(months => $2::integer - 1))::date AS period_start
    ), months AS (
      SELECT n AS month, (year_start + make_interval(months => n - 1))::date AS start,
        (year_start + make_interval(months => n) - interval '1 day')::date AS finish
      FROM settings CROSS JOIN generate_series(1, 12) n
    ), cutoffs AS (
      SELECT finish AS cutoff FROM months
      UNION SELECT (year_start - 1)::date FROM settings
      UNION SELECT day::date FROM settings CROSS JOIN LATERAL generate_series(
        period_start - 1, period_start + interval '1 month' - interval '1 day', interval '1 day') day
    ), snapshots AS MATERIALIZED (
      SELECT cutoffs.cutoff, b.* FROM cutoffs CROSS JOIN LATERAL (${snapshotRowsSql(ledger)}) b
    ), totals AS (
      SELECT cutoffs.cutoff, coalesce(sum(b.face), 0) AS face, coalesce(sum(b.paid), 0) AS paid,
        coalesce(sum(b.adjustment), 0) AS adjustment, coalesce(sum(b.outstanding), 0) AS outstanding
      FROM cutoffs LEFT JOIN snapshots b USING (cutoff) GROUP BY cutoffs.cutoff
    ), coverage AS (
      SELECT (SELECT count(*)::integer FROM finance.import_issues WHERE issue_code = 'rejected') AS rejected,
        NOT EXISTS (SELECT 1 FROM snapshots WHERE outstanding IS NULL OR date IS NULL OR due IS NULL)
        AND NOT EXISTS (SELECT 1 FROM finance.${cashTable}
          WHERE (${cashDate} <= $1::date OR ${cashDate} IS NULL)
            AND (status IS NULL OR status NOT IN ('Posted', 'Cancelled', 'Canceled', 'Reversed', 'Voided')
              OR (status = 'Posted' AND (${cashDate} IS NULL OR ${cashAmount} IS NULL OR ${cashAmount} < 0)))) AS valid
    ), readiness AS (
      SELECT rejected, valid AND rejected = 0 AS complete FROM coverage
    ), movements AS (
      -- Cumulative component differences reconcile exactly to the two independently rebuilt balances.
      SELECT m.month, m.start, m.finish, o.outstanding AS opening, c.face - o.face AS posted,
        c.paid - o.paid AS applied, c.adjustment - o.adjustment AS adjustments, c.outstanding AS closing
      FROM months m JOIN totals o ON o.cutoff = m.start - 1 JOIN totals c ON c.cutoff = m.finish
    ), cohort_values AS (
      SELECT m.month, mv.applied,
        coalesce((SELECT sum(face) FROM snapshots WHERE cutoff = $1::date AND date BETWEEN m.start AND m.finish), 0) AS billing,
        coalesce((SELECT sum(${cashAmount}) FROM finance.${cashTable}
          WHERE status = 'Posted' AND ${cashDate} BETWEEN m.start AND m.finish), 0) AS cash,
        coalesce(sum(b.face), 0) AS face, coalesce(sum(b.paid), 0) AS settled,
        coalesce(sum(b.adjustment), 0) AS adjustments,
        coalesce(sum(greatest(b.outstanding, 0)), 0) AS unpaid
      FROM months m JOIN movements mv USING (month)
      LEFT JOIN snapshots b ON b.cutoff = m.finish AND b.due BETWEEN m.start AND m.finish
      GROUP BY m.month, m.start, m.finish, mv.applied
    ), cohorts AS (
      SELECT *, sum(unpaid) OVER (ORDER BY month) AS cumulative_shortfall FROM cohort_values
    ), daily_movements AS (
      SELECT c.cutoff AS date, o.outstanding AS opening, c.face - o.face AS posted,
        c.paid - o.paid AS applied, c.adjustment - o.adjustment AS adjustments, c.outstanding AS closing
      FROM totals c JOIN totals o ON o.cutoff = c.cutoff - 1 CROSS JOIN settings
      WHERE c.cutoff >= period_start AND c.cutoff < period_start + interval '1 month'
    ), party_movements AS (
      SELECT b.party_id AS id, b.party AS name,
        coalesce(sum(b.outstanding) FILTER (WHERE b.cutoff = m.finish), 0)
          - coalesce(sum(b.outstanding) FILTER (WHERE b.cutoff = m.start - 1), 0) AS change
      FROM snapshots b CROSS JOIN months m
      WHERE m.month = $2 AND b.cutoff IN (m.finish, m.start - 1)
      GROUP BY b.party_id, b.party
    ), bucket_values AS (
      SELECT b.cutoff, CASE WHEN b.cutoff - b.due <= 0 THEN 0 WHEN b.cutoff - b.due <= 30 THEN 1
        WHEN b.cutoff - b.due <= 60 THEN 2 WHEN b.cutoff - b.due <= 90 THEN 3 ELSE 4 END AS bucket,
        sum(greatest(b.outstanding, 0)) AS amount
      FROM snapshots b CROSS JOIN months m WHERE m.month = $2 AND b.cutoff IN (m.finish, m.start - 1)
      GROUP BY b.cutoff, bucket
    ), bucket_changes AS (
      SELECT n AS bucket, coalesce(sum(b.amount) FILTER (WHERE b.cutoff = m.start - 1), 0) AS opening,
        coalesce(sum(b.amount) FILTER (WHERE b.cutoff = m.finish), 0) AS closing
      FROM generate_series(0, 4) n CROSS JOIN months m LEFT JOIN bucket_values b ON b.bucket = n
      WHERE m.month = $2 GROUP BY n
    ), projection AS (
      SELECT avg(closing - opening) AS movement FROM movements WHERE month BETWEEN $2 - 2 AND $2
    )
    SELECT $1::text AS "asOf", $2::integer AS month,
      CASE WHEN r.complete THEN m.opening::text END AS opening,
      CASE WHEN r.complete THEN m.posted::text END AS posted,
      CASE WHEN r.complete THEN m.applied::text END AS applied,
      CASE WHEN r.complete THEN m.adjustments::text END AS adjustments,
      CASE WHEN r.complete THEN m.closing::text END AS closing,
      (SELECT coalesce(json_agg(json_build_object('date', date::text,
        'opening', CASE WHEN r.complete THEN opening::text END, 'posted', CASE WHEN r.complete THEN posted::text END,
        'applied', CASE WHEN r.complete THEN applied::text END, 'adjustments', CASE WHEN r.complete THEN adjustments::text END,
        'closing', CASE WHEN r.complete THEN closing::text END) ORDER BY date), '[]'::json) FROM daily_movements) AS daily,
      (SELECT json_agg(json_build_object('month', month,
        'billing', CASE WHEN r.complete THEN billing::text END, 'cash', CASE WHEN r.complete THEN cash::text END,
        'applied', CASE WHEN r.complete THEN applied::text END, 'face', CASE WHEN r.complete THEN face::text END,
        'settled', CASE WHEN r.complete THEN settled::text END, 'adjustments', CASE WHEN r.complete THEN adjustments::text END,
        'unpaid', CASE WHEN r.complete THEN unpaid::text END,
        'cumulativeShortfall', CASE WHEN r.complete THEN cumulative_shortfall::text END) ORDER BY month) FROM cohorts) AS cohorts,
      CASE WHEN r.complete THEN (SELECT coalesce(json_agg(json_build_object('id', id, 'name', name, 'change', change::text)
        ORDER BY change DESC, id), '[]'::json) FROM party_movements WHERE change <> 0) ELSE '[]'::json END AS contributors,
      (SELECT json_agg(json_build_object('label', (ARRAY['Current','1–30 days','31–60 days','61–90 days','91+ days'])[bucket + 1],
        'opening', CASE WHEN r.complete THEN opening::text END, 'closing', CASE WHEN r.complete THEN closing::text END,
        'change', CASE WHEN r.complete THEN (closing - opening)::text END) ORDER BY bucket) FROM bucket_changes) AS "ageingChanges",
      CASE WHEN r.complete AND $2 >= 3 THEN json_build_object('closing', m.closing::text,
        'monthlyMovement', round(p.movement, 2)::text, 'illustration', round(m.closing + p.movement, 2)::text,
        'start', to_char(m.start - interval '2 months', 'Mon'), 'end', to_char(m.start, 'Mon')) END AS projection,
      r.rejected AS "rejectedRows", r.complete
    FROM movements m CROSS JOIN readiness r CROSS JOIN projection p WHERE m.month = $2
  `, [reportingDate, selectedMonth]);
  return result.rows[0];
}
