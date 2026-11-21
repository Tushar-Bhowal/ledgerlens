import "server-only";
import { getDatabasePool } from "@/server/db";
import { documentBalancesSql, reportingDate, type Ledger } from "./documents";
import { snapshotRowsSql } from "./snapshots";

export type MeasurePattern = { label: string; amount: string | null };
export type PartyConcentration = { id: string; party: string; amount: string | null; share: number | null };
export type GroupConcentration = { name: string; amount: string | null; share: number | null; members: { id: string; name: string }[] };
export type MeasuresResult = {
  asOf: string;
  ledger: Ledger;
  overduePercent: number | null;
  proxyDays: number | null;
  standardDays: number | null;
  elapsedDays: number | null;
  totalPositive: string | null;
  averageDailyBalance: string | null;
  denominatorLabel: string;
  proxyLabel: string;
  patterns: MeasurePattern[];
  parties: PartyConcentration[];
  groups: GroupConcentration[];
  rejectedRows: number;
  complete: boolean;
};

export async function getMeasures(ledger: Ledger): Promise<MeasuresResult> {
  const ar = ledger === "ar";
  const id = ar ? "invoice_id" : "bill_id";
  const partyId = ar ? "customer_id" : "vendor_id";
  const master = ar ? "customer_master" : "vendor_master";
  const group = ar ? "parent_group" : "vendor_group";
  const allocations = ar ? "ar_receipt_allocations" : "ap_payment_allocations";
  const cash = ar ? "ar_receipts" : "ap_payments";
  const cashId = ar ? "receipt_id" : "payment_id";
  const cashDate = ar ? "receipt_date" : "payment_date";
  const result = await getDatabasePool().query<Omit<MeasuresResult, "asOf" | "ledger" | "denominatorLabel" | "proxyLabel" | "standardDays">>(`
    WITH ${documentBalancesSql(ledger)}, cutoffs AS (
      SELECT day::date AS cutoff FROM generate_series(date_trunc('year', $1::date), $1::date, interval '1 day') day
    ), daily_balances AS MATERIALIZED (
      -- Average actual daily closing balances, including genuine zero-balance days.
      SELECT cutoffs.cutoff, t.balance, t.incomplete FROM cutoffs CROSS JOIN LATERAL (
        WITH historical AS (${snapshotRowsSql(ledger)})
        SELECT coalesce(sum(outstanding), 0) AS balance, coalesce(bool_or(outstanding IS NULL), false) AS incomplete FROM historical
      ) t
    ), coverage AS (
      SELECT (SELECT count(*)::integer FROM finance.import_issues WHERE issue_code = 'rejected') AS rejected,
        NOT EXISTS (SELECT 1 FROM balances WHERE outstanding IS NULL OR date IS NULL OR (outstanding > 0 AND due IS NULL))
        AND NOT EXISTS (SELECT 1 FROM daily_balances WHERE incomplete) AS valid
    ), readiness AS (SELECT rejected, valid AND rejected = 0 AS complete FROM coverage), totals AS (
      SELECT coalesce(sum(greatest(outstanding, 0)), 0) AS positive,
        coalesce(sum(outstanding) FILTER (WHERE status = 'overdue'), 0) AS overdue,
        coalesce(sum(face) FILTER (WHERE date BETWEEN date_trunc('year', $1::date)::date AND $1::date), 0) AS billing
      FROM balances
    ), party_values AS (
      SELECT party_id AS id, party, sum(outstanding) AS amount FROM balances WHERE outstanding > 0 GROUP BY party_id, party
    ), group_values AS (
      SELECT coalesce(m.${group}, 'Group unavailable') AS name, sum(b.outstanding) AS amount,
        json_agg(DISTINCT jsonb_build_object('id', b.party_id, 'name', b.party)) AS members
      FROM balances b JOIN finance.${master} m ON m.${partyId} = b.party_id
      WHERE b.outstanding > 0 GROUP BY coalesce(m.${group}, 'Group unavailable')
    ), timing AS (
      -- Allocation totals validate the whole split cash voucher before any portion enters timing metrics.
      SELECT a.allocated_amount_inr AS amount, a.allocation_date - b.date AS doc_days,
        a.allocation_date - b.due AS due_days
      FROM balances b JOIN allocation_totals t ON t.document_id = b.id AND NOT t.invalid
      JOIN finance.${allocations} a ON a.${id} = b.id
      JOIN finance.${cash} c ON c.${cashId} = a.${cashId} AND c.${partyId} = b.party_id
      WHERE b.outstanding IS NOT NULL AND b.date IS NOT NULL AND b.due IS NOT NULL
        AND a.status = 'Allocated' AND c.status = 'Posted' AND a.allocated_amount_inr > 0
        AND a.allocation_date BETWEEN b.date AND $1::date AND c.${cashDate} <= $1::date
    ), timing_totals AS (
      SELECT sum(amount * doc_days) / nullif(sum(amount), 0) AS elapsed,
        coalesce(sum(amount) FILTER (WHERE due_days < 0), 0) AS early,
        coalesce(sum(amount) FILTER (WHERE due_days = 0), 0) AS on_time,
        coalesce(sum(amount) FILTER (WHERE due_days BETWEEN 1 AND 30), 0) AS late_30,
        coalesce(sum(amount) FILTER (WHERE due_days > 30), 0) AS late_more FROM timing
    ), average_balance AS (SELECT avg(balance) AS amount, count(*) AS days FROM daily_balances)
    SELECT r.rejected AS "rejectedRows", r.complete,
      CASE WHEN r.complete THEN round(t.overdue / nullif(t.positive, 0) * 100, 1)::float8 END AS "overduePercent",
      CASE WHEN r.complete THEN t.positive::text END AS "totalPositive",
      CASE WHEN r.complete THEN round(a.amount, 2)::text END AS "averageDailyBalance",
      CASE WHEN r.complete AND a.amount >= 0 AND t.billing > 0 THEN round(a.amount / t.billing * a.days, 1)::float8 END AS "proxyDays",
      CASE WHEN r.complete THEN round(tt.elapsed, 1)::float8 END AS "elapsedDays",
      json_build_array(
        json_build_object('label', 'Early (before due date)', 'amount', CASE WHEN r.complete THEN tt.early::text END),
        json_build_object('label', 'On time (on due date)', 'amount', CASE WHEN r.complete THEN tt.on_time::text END),
        json_build_object('label', '1–30 days late', 'amount', CASE WHEN r.complete THEN tt.late_30::text END),
        json_build_object('label', '31+ days late', 'amount', CASE WHEN r.complete THEN tt.late_more::text END)
      ) AS patterns,
      CASE WHEN r.complete THEN (SELECT coalesce(json_agg(json_build_object('id', p.id, 'party', p.party, 'amount', p.amount::text,
        'share', (p.amount / nullif(t.positive, 0))::float8) ORDER BY p.amount DESC, p.id), '[]'::json)
        FROM (SELECT * FROM party_values ORDER BY amount DESC, id LIMIT 5) p) ELSE '[]'::json END AS parties,
      CASE WHEN r.complete THEN (SELECT coalesce(json_agg(json_build_object('name', g.name, 'amount', g.amount::text,
        'share', (g.amount / nullif(t.positive, 0))::float8, 'members', g.members) ORDER BY g.amount DESC, g.name), '[]'::json)
        FROM group_values g) ELSE '[]'::json END AS groups
    FROM readiness r CROSS JOIN totals t CROSS JOIN timing_totals tt CROSS JOIN average_balance a
  `, [reportingDate]);
  return {
    ...result.rows[0], asOf: reportingDate, ledger, standardDays: null,
    proxyLabel: ar ? "Invoice-billing DSO proxy" : "Purchase-billing AP days proxy",
    denominatorLabel: ar
      ? "Actual average daily net AR / posted 2025 invoice-face billing by original invoice date × elapsed calendar days. Net credit sales are not separately supplied."
      : "Actual average daily net AP / posted 2025 bill-face purchases by original bill date × elapsed calendar days. Standard DPO is unavailable because COGS is not supplied.",
  };
}
