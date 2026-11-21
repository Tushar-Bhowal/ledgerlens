# Financial rules

Reporting cutoff: 2025-12-31. Currency: INR. Source: supplied CSV snapshot.

1. Recognize invoice/bill balances by posting date. Group billing by original document date using documents recognized by the reporting cutoff.
2. Outstanding = face − eligible allocated cash + signed adjustments. Credit notes reduce balances; debit notes increase them. Aggregate allocations and adjustments separately to prevent join multiplication.
3. Validate an entire split cash voucher: allocated amount, party consistency, cash date, posting date and total allocation must be valid. Invalid or unknown settlement inputs withhold affected balances.
4. Preserve cancelled/reversed records for audit; exclude them from active balances. Detail evidence can show inactive source status with no active balance.
5. Original dates remain unchanged after partial payments. Ageing uses configurable original, due, posting or last-transaction date buckets. Last transaction is the latest posting, eligible cash-allocation or posted adjustment date through the cutoff; it does not reset the original-date basis. Missing dates prevent affected ageing outputs.
6. Rebuild historical balances from the same canonical query at each historical cutoff. Opening is the previous close, including supported pre-year transactions. Component differences must reconcile every daily/monthly bridge.
7. Current disputes are capped separately per overdue invoice. Only dated, party-matched unresolved disputes reduce actionable overdue. Source resolution dates are missing, so historical resolution timing cannot be reconstructed.
8. A broken promise must have a valid invoice/customer link, follow-up on/after the invoice, promise on/after follow-up and by cutoff, and a currently overdue invoice. Invalid chronology is investigation evidence rather than an escalation trigger.
9. Supplier holds/disputes use cutoff-aware controls. MSME is a source flag, not proof of a statutory acceptance date. Pending payment approval does not reverse posted cash settlement. A bill linked to a posted payment without approved status requires control review before further scheduling; this is a related-payment warning, not an inferred bill approval status.
10. Concentration uses positive exposure; net balances retain credits. Average daily balances are actual reconstructed net closes. Invoice/purchase billing-based days are labelled proxies; formal DSO/DPO and CCC are unavailable where credit-sales/COGS/inventory inputs are missing.
11. A due cohort is measured at its own month end. Cumulative historical shortfalls do not equal current collectible balances. Customer history shows billing, cash received, due face, applied cash, adjustments, cohort shortfall and overdue trend separately.
12. A next-month illustration requires three complete months and continues their mean net movement, floored at zero. It is not observed future data, a guaranteed receipt, or a forecast.
13. Missing amounts/statuses/dates and rejected imports are disclosed. Known post-cutoff events do not contaminate historical coverage. Original CSV filename/record references support independent review.
14. Bank statements, GL/control balances, inventory, COGS, tax certificates, acceptance dates and credit-limit revision history were not supplied. Do not infer reconciliation, legal deadlines, tax deductions or guaranteed cash recovery from absent records.
15. All decisions are advisory. The app cannot initiate/approve payments, change limits, write off debt or update financial source ledgers through the Assistant.

Standalone receipt/payment investigations retain original headers and every recorded allocation for audit, including future and inactive rows. The audit list is separate from eligible allocated cash and unallocated residual at the reporting cutoff. Unsupported cutoff amounts remain unavailable. Nonconsecutive or partial-date Assistant comparisons require clarification; supported monthly closes are not silently substituted.
