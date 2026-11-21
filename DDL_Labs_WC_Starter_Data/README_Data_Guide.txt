DDL LABS — WORKING CAPITAL INTELLIGENCE STARTER DATA
Dataset type: Synthetic demonstration data. No real customer/vendor information.
Reporting as-of date: 2025-12-31
Currency: INR

PURPOSE
This starter pack supports the initial AR/AP Working Capital Intelligence assignment and its six mandatory AI-agent scenarios. It is deliberately seeded with examples of overdue/high-risk customers, broken collection promises, disputes, unallocated receipts, duplicate invoice/bill references, missing PO/GRN references, payment holds and pending approvals.

FILES
customer_master.csv — customer profile, credit limit, terms, region, business unit and salesperson.
vendor_master.csv — vendor profile, payment terms, MSME and criticality.
ar_invoices.csv — AR invoice headers, invoice/posting/due dates, sales order and delivery references.
ar_receipts.csv — customer receipts and bank references.
ar_receipt_allocations.csv — receipt-to-invoice allocation bridge; use this to calculate settled amounts.
ar_adjustments.csv — AR credit/debit adjustments.
ap_invoices.csv — AP bill headers, due dates, PO and GRN references.
ap_payments.csv — vendor payments, method, bank reference and approval status.
ap_payment_allocations.csv — payment-to-bill allocation bridge.
ap_adjustments.csv — AP adjustments.
disputes.csv — customer invoice and vendor bill disputes.
collection_followups.csv — collection promises and follow-up history.
payment_holds.csv — payment hold reason/status.
business_calendar.csv — calendar, month-end and weekend attributes.

KEY RELATIONSHIPS
customer_master.customer_id -> AR invoice/receipt/follow-up customer_id.
vendor_master.vendor_id -> AP invoice/payment/hold vendor_id.
ar_invoices.invoice_id -> ar_receipt_allocations.invoice_id and ar_adjustments.invoice_id.
ar_receipts.receipt_id -> ar_receipt_allocations.receipt_id.
ap_invoices.bill_id -> ap_payment_allocations.bill_id and ap_adjustments.bill_id.
ap_payments.payment_id -> ap_payment_allocations.payment_id.
disputes links through invoice_id or bill_id; party_type identifies Customer or Vendor.

CALCULATION GUIDANCE
AR settled amount = sum(valid allocated receipt amounts) + applicable settlement adjustments, applying the adjustment sign/type correctly.
AR outstanding = invoice amount - allocated receipts - applicable credit notes/settlements + applicable debit notes, subject to transaction status.
AP paid amount = sum(valid allocated payment amounts) + applicable settlement adjustments, applying sign/type correctly.
AP outstanding = bill amount - allocated payments - applicable credits + applicable debits.
Do not join invoice headers directly to unaggregated allocation rows when calculating totals; aggregate allocations by invoice/bill first to avoid duplication.
Use the fixed as-of date 2025-12-31 for the supplied snapshot analysis. For historical trends, use transaction dates.
Do not treat unallocated receipts/payments as invoice settlement. Report them separately.
Treat missing PO/GRN references as data-quality/exception indicators, not automatically as proof of invalid spend.
The duplicate invoice/bill references are intentionally seeded for exception testing. Confirm duplicates using party, amount, dates and references; do not assume every repeated string is fraud.
Risk segmentation in customer_master is an input label for testing only. Candidates should explain and implement their own transparent risk logic rather than simply copying the label.
This pack does not include bank statement line items, GL, Trial Balance, inventory, legal case register, budget/forecast, or audit/change logs. Do not claim bank/GL reconciliation, full CCC, legal recovery analysis, or inventory days from this pack.
