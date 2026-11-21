import "server-only";
import { documentBalancesSql, type Ledger } from "./documents";

export function snapshotRowsSql(ledger: Ledger) {
  // Each historical cutoff must apply the exact settlement rules used by current invoice evidence.
  return `WITH ${documentBalancesSql(ledger).replaceAll("$1::date", "cutoffs.cutoff")} SELECT * FROM balances`;
}
