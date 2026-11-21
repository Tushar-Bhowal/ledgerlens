# Financial schema and source mapping

The first migration is db/migrations/001_finance.sql. It defines a dedicated finance schema with 14 source tables and one import-issues table. Each source table uses the corresponding CSV basename, and each CSV column keeps its original name.

This is the schema implementation stage. The migration was applied successfully to an isolated PostgreSQL 18 instance. Catalog inspection confirmed 15 tables, 18 foreign keys and 53 check constraints. The migration runner and transactional CSV importer are implemented. Financial services now use the shared document-balance SQL for current and historical calculations.

## Tables and relationships

| Source file and table in finance | Primary key | References |
| --- | --- | --- |
| customer_master | customer_id | Customer master record |
| vendor_master | vendor_id | Supplier master record |
| ar_invoices | invoice_id | customer_id → customer_master |
| ar_receipts | receipt_id | customer_id → customer_master |
| ar_receipt_allocations | allocation_id | receipt_id → ar_receipts and invoice_id → ar_invoices |
| ar_adjustments | adjustment_id | invoice_id → ar_invoices and customer_id → customer_master |
| ap_invoices | bill_id | vendor_id → vendor_master |
| ap_payments | payment_id | vendor_id → vendor_master |
| ap_payment_allocations | allocation_id | payment_id → ap_payments and bill_id → ap_invoices |
| ap_adjustments | adjustment_id | bill_id → ap_invoices and vendor_id → vendor_master |
| disputes | dispute_id | invoice_id → ar_invoices or bill_id → ap_invoices |
| collection_followups | followup_id | customer_id → customer_master and invoice_id → ar_invoices |
| payment_holds | hold_id | vendor_id → vendor_master and bill_id → ap_invoices |
| business_calendar | calendar_date | Independent calendar |

Every source table adds source_filename and source_record_number. Record numbers count data records from one, excluding the CSV header. A quoted field containing a newline is part of one record. The file and record pair is unique within the table.

## Column types and missing values

| Source fields | PostgreSQL type and treatment |
| --- | --- |
| IDs and references | text. Source IDs are primary keys. Printed invoice numbers, bank references and voucher references can repeat. |
| All INR amounts and limits | numeric(20, 2). The importer must validate finite decimal values with at most two decimal places before insertion to prevent silent rounding. Missing amounts stay NULL. |
| Document, posting, due, cash, allocation, adjustment and activity dates | date. Optional missing values stay NULL. Invalid nonempty values must be reported by the importer. |
| Master credit/payment days | integer. Missing values stay NULL. |
| related_party_flag, msme_flag | boolean. Missing values stay NULL. |
| Descriptions, groups, terms, status and notes | text. The importer preserves supplied text and maps empty optional fields to NULL. |
| Calendar fields | Required date, integer year/month, text quarter and boolean flags. Month and quarter have range checks. The importer must validate consistency with calendar_date. |

Source IDs, master names and parent references are required. A missing required value or unresolved parent is retained as a rejected raw record in import_issues. Other nullable fields allow a record to remain inspectable with its missing inputs.

Each import issue stores the source filename, record number, optional source ID, issue code, readable reason, original fields as a JSON object and recorded time. Multiple issues may describe one source row.

## Why the relationships matter

An invoice can receive several receipts. A receipt can be split between several invoices. Each split has its own allocation ID, date and amount. AP uses the same arrangement for payments and bills. There is no unique constraint on an invoice/receipt pair.

Foreign keys require parent records to exist. They do not establish that an allocation's receipt and invoice belong to the same customer. The importer and financial services must check that relationship before allowing settlement. The same check applies to AP, adjustments, follow-ups, holds and disputes. A disagreement must remain visible as an import issue or an excluded source exception.

A dispute has exactly one invoice or bill link, consistent with party_type. Its party_id comes from the source. The importer must check that this ID matches the linked document's party.

## Financial rules used by services

- Use posting date to recognise an invoice in a ledger balance and original date for document-date billing.
- Sum eligible allocations and adjustments separately before joining them to invoices.
- Preserve the source adjustment amount and type. The service applies the documented credit/debit sign.
- Keep AP posting status separate from approval status.
- Preserve cancelled/reversed statuses, unexpected negative values and chronology conflicts for investigation.
- Determine unallocated cash from cash headers and their eligible allocations.
- Keep missing dates and amounts visible in coverage disclosures.
- Apply the requested cutoff consistently. The supplied snapshot cutoff is 31 December 2025 in INR.

The schema intentionally allows a follow-up or dispute dated before its invoice. Those known source conflicts must be reported and excluded from automatic escalation by later logic. Totals and outstanding balances are derived from events when requested.

The calendar has no foreign key from transaction dates. The pack contains valid posting/due dates outside its 2025 calendar.

## Migration behaviour

BEGIN and COMMIT make the migration atomic. An error must abort the transaction. The migration creates new objects and fails if finance already exists. The migration runner records filenames and SHA-256 checksums, skips applied migrations and serializes concurrent runs using a PostgreSQL advisory lock. It commits each migration and its history together.

Foreign keys use PostgreSQL's default restriction on deleting referenced parents. The snapshot importer replaces records in one transaction after checking all file headers and shapes. It locks concurrent imports and inserts parent tables before children.

Indexes cover source-reference searches, customer/vendor drill-down, document cutoffs, due dates and linked allocations/activity. Their performance still needs verification against actual service queries.

## Source coverage

The pack has 14 CSVs and 2,452 data records. It lacks inventory, COGS, bank statements, GL/control accounts, trial balance, line items, tax/retention breakdowns, historical credit-limit changes, legal cases, forecasts and audit logs. These remain unavailable. The schema preserves the fields actually supplied.

## Import process

Run `npm run migrate`, then `npm run import:data` with DATABASE_URL_UNPOOLED set to a direct connection. An optional CSV directory can be passed after `--`. The importer rejects malformed fields and missing or mismatched parents, retains their raw fields in import_issues, and prints counts after commit. It records a chronology_warning when a linked dispute or follow-up precedes the invoice. Such records remain stored for investigation.

The importer checks headers against the schema and requires a matching ordered column set. It reads all source files before beginning snapshot replacement. Invalid file structure aborts before replacement. Unexpected database failures roll back the transaction. A row-level validation or constraint failure records a rejected row while the import continues. Reimport replaces all 14 source tables and import issues atomically.

The configured Neon database loaded all 2,452 supplied records with zero rejections and two chronology warnings. Isolated PostgreSQL verification repeated the import with the same counts. An injected database failure after replacement began left the previous snapshot intact. The later integration suite verifies financial calculations and mocked-provider chat flows; see docs/test-report.md.

## Operational migration

002_chat_requests.sql adds public.ledgerlens_chat_requests for shared request/concurrency reservations. It is not a source finance table and the importer does not truncate it. Financial policy and unavailable metrics are documented in financial-rules.md.
