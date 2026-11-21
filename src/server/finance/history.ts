import "server-only";
import { getDatabasePool } from "@/server/db";
import { documentBalancesSql, reportingDate, type Ledger } from "./documents";

type MonthBalance = { date: string; receivables: string | null; payables: string | null };

export async function getBalanceHistory() {
  // Rebuild each month at its own cutoff so later payments cannot change an earlier balance.
  const ar = documentBalancesSql("ar").replaceAll("$1::date", "months.cutoff");
  const ap = documentBalancesSql("ap").replaceAll("$1::date", "months.cutoff");
  const result = await getDatabasePool().query<MonthBalance & { rejectedRows: number }>(`
    WITH months AS (
      SELECT (date_trunc('month', $1::date) - make_interval(months => n)
        + interval '1 month' - interval '1 day')::date AS cutoff
      FROM generate_series(11, 0, -1) AS offsets(n)
    ), coverage AS (
      SELECT count(*)::integer AS rejected FROM finance.import_issues WHERE issue_code = 'rejected'
    )
    SELECT months.cutoff::text AS date,
      CASE WHEN coverage.rejected > 0 THEN NULL ELSE ar.total::text END AS receivables,
      CASE WHEN coverage.rejected > 0 THEN NULL ELSE ap.total::text END AS payables,
      coverage.rejected AS "rejectedRows"
    FROM months CROSS JOIN coverage
    CROSS JOIN LATERAL (
      WITH ${ar}
      SELECT CASE WHEN bool_or(outstanding IS NULL) THEN NULL ELSE coalesce(sum(outstanding), 0) END AS total
      FROM balances
    ) ar
    CROSS JOIN LATERAL (
      WITH ${ap}
      SELECT CASE WHEN bool_or(outstanding IS NULL) THEN NULL ELSE coalesce(sum(outstanding), 0) END AS total
      FROM balances
    ) ap
    ORDER BY months.cutoff
  `, [reportingDate]);

  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return {
    asOf: reportingDate,
    months: result.rows.map(({ date, receivables, payables }) => ({
      month: names[Number(date.slice(5, 7)) - 1], date, receivables, payables,
    })),
    rejectedRows: result.rows[0]?.rejectedRows ?? 0,
  };
}

type AgeingRow = {
  bucket0: string | null; bucket1: string | null; bucket2: string | null;
  bucket3: string | null; bucket4: string | null; total: string | null;
  unknownCount: number; rejectedRows: number;
};

export async function getAgeing(ledger: Ledger, basis: "due" | "date" | "posted" | "last", boundaries: [number, number, number]) {
  // Age the outstanding amount, retaining the original document date after partial settlement.
  const result = await getDatabasePool().query<AgeingRow>(`
    WITH ${documentBalancesSql(ledger)},
    aged AS (
      SELECT outstanding, CASE $5::text WHEN 'due' THEN due WHEN 'posted' THEN posted WHEN 'last' THEN last_transaction ELSE date END AS basis_date
      FROM balances
    ), measured AS (
      SELECT outstanding, basis_date, $1::date - basis_date AS elapsed
      FROM aged
    ), totals AS (
      SELECT COUNT(*) FILTER (WHERE outstanding IS NULL OR (outstanding > 0 AND basis_date IS NULL))::integer AS unknown_count,
        COALESCE(SUM(outstanding) FILTER (WHERE outstanding > 0 AND elapsed <= 0), 0) AS bucket0,
        COALESCE(SUM(outstanding) FILTER (WHERE outstanding > 0 AND elapsed BETWEEN 1 AND $2), 0) AS bucket1,
        COALESCE(SUM(outstanding) FILTER (WHERE outstanding > 0 AND elapsed > $2 AND elapsed <= $3), 0) AS bucket2,
        COALESCE(SUM(outstanding) FILTER (WHERE outstanding > 0 AND elapsed > $3 AND elapsed <= $4), 0) AS bucket3,
        COALESCE(SUM(outstanding) FILTER (WHERE outstanding > 0 AND elapsed > $4), 0) AS bucket4,
        COALESCE(SUM(outstanding) FILTER (WHERE outstanding > 0), 0) AS total
      FROM measured
    ), coverage AS (
      SELECT COUNT(*)::integer AS rejected FROM finance.import_issues WHERE issue_code = 'rejected'
    )
    SELECT CASE WHEN unknown_count > 0 OR rejected > 0 THEN NULL ELSE bucket0::text END AS bucket0,
      CASE WHEN unknown_count > 0 OR rejected > 0 THEN NULL ELSE bucket1::text END AS bucket1,
      CASE WHEN unknown_count > 0 OR rejected > 0 THEN NULL ELSE bucket2::text END AS bucket2,
      CASE WHEN unknown_count > 0 OR rejected > 0 THEN NULL ELSE bucket3::text END AS bucket3,
      CASE WHEN unknown_count > 0 OR rejected > 0 THEN NULL ELSE bucket4::text END AS bucket4,
      CASE WHEN unknown_count > 0 OR rejected > 0 THEN NULL ELSE total::text END AS total,
      unknown_count AS "unknownCount", rejected AS "rejectedRows"
    FROM totals CROSS JOIN coverage
  `, [reportingDate, ...boundaries, basis]);

  const row = result.rows[0];
  const [first, second, third] = boundaries;
  return {
    asOf: reportingDate, ledger, basis, boundaries,
    buckets: [
      { label: basis === "due" ? "Current" : "0 days", amount: row.bucket0 },
      { label: `1–${first} days`, amount: row.bucket1 },
      { label: `${first + 1}–${second} days`, amount: row.bucket2 },
      { label: `${second + 1}–${third} days`, amount: row.bucket3 },
      { label: `${third + 1}+ days`, amount: row.bucket4 },
    ],
    total: row.total, unknownCount: row.unknownCount, rejectedRows: row.rejectedRows,
  };
}
