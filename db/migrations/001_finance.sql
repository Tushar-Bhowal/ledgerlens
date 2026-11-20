BEGIN;

CREATE SCHEMA finance;

CREATE TABLE finance.customer_master (
    customer_id text PRIMARY KEY CHECK (btrim(customer_id) <> ''),
    customer_name text NOT NULL CHECK (btrim(customer_name) <> ''),
    parent_group text,
    industry text,
    region text,
    business_unit text,
    salesperson_id text,
    credit_limit_inr numeric(20, 2),
    credit_period_days integer,
    payment_terms text,
    risk_segment text,
    related_party_flag boolean,
    status text,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    UNIQUE (source_filename, source_record_number)
);

CREATE TABLE finance.vendor_master (
    vendor_id text PRIMARY KEY CHECK (btrim(vendor_id) <> ''),
    vendor_name text NOT NULL CHECK (btrim(vendor_name) <> ''),
    vendor_group text,
    category text,
    region text,
    msme_flag boolean,
    criticality text,
    payment_terms_days integer,
    status text,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    UNIQUE (source_filename, source_record_number)
);

CREATE TABLE finance.ar_invoices (
    invoice_id text PRIMARY KEY CHECK (btrim(invoice_id) <> ''),
    -- A printed number can repeat. The source ID identifies the actual invoice.
    invoice_number text,
    customer_id text NOT NULL REFERENCES finance.customer_master (customer_id),
    invoice_date date,
    posting_date date,
    due_date date,
    sales_order_id text,
    delivery_reference text,
    -- Preserve missing and unexpected amounts so services can report coverage and exceptions.
    invoice_amount_inr numeric(20, 2),
    currency text,
    status text,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    UNIQUE (source_filename, source_record_number)
);

CREATE TABLE finance.ar_receipts (
    receipt_id text PRIMARY KEY CHECK (btrim(receipt_id) <> ''),
    receipt_reference text,
    customer_id text NOT NULL REFERENCES finance.customer_master (customer_id),
    receipt_date date,
    receipt_amount_inr numeric(20, 2),
    payment_mode text,
    bank_reference text,
    status text,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    UNIQUE (source_filename, source_record_number)
);

CREATE TABLE finance.ar_receipt_allocations (
    allocation_id text PRIMARY KEY CHECK (btrim(allocation_id) <> ''),
    -- Separate rows let one receipt settle several invoices and an invoice receive several payments.
    receipt_id text NOT NULL REFERENCES finance.ar_receipts (receipt_id),
    invoice_id text NOT NULL REFERENCES finance.ar_invoices (invoice_id),
    allocated_amount_inr numeric(20, 2),
    allocation_date date,
    status text,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    UNIQUE (source_filename, source_record_number)
);

CREATE TABLE finance.ar_adjustments (
    adjustment_id text PRIMARY KEY CHECK (btrim(adjustment_id) <> ''),
    invoice_id text NOT NULL REFERENCES finance.ar_invoices (invoice_id),
    customer_id text NOT NULL REFERENCES finance.customer_master (customer_id),
    adjustment_date date,
    -- Keep the supplied amount and type. The balance service determines the credit/debit sign.
    adjustment_type text,
    amount_inr numeric(20, 2),
    reference text,
    status text,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    UNIQUE (source_filename, source_record_number)
);

CREATE TABLE finance.ap_invoices (
    bill_id text PRIMARY KEY CHECK (btrim(bill_id) <> ''),
    bill_number text,
    vendor_id text NOT NULL REFERENCES finance.vendor_master (vendor_id),
    bill_date date,
    posting_date date,
    due_date date,
    purchase_order_id text,
    grn_reference text,
    bill_amount_inr numeric(20, 2),
    currency text,
    status text,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    UNIQUE (source_filename, source_record_number)
);

CREATE TABLE finance.ap_payments (
    payment_id text PRIMARY KEY CHECK (btrim(payment_id) <> ''),
    payment_reference text,
    vendor_id text NOT NULL REFERENCES finance.vendor_master (vendor_id),
    payment_date date,
    payment_amount_inr numeric(20, 2),
    payment_method text,
    bank_reference text,
    -- Posting affects settlement. Approval is a separate control fact.
    approval_status text,
    status text,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    UNIQUE (source_filename, source_record_number)
);

CREATE TABLE finance.ap_payment_allocations (
    allocation_id text PRIMARY KEY CHECK (btrim(allocation_id) <> ''),
    payment_id text NOT NULL REFERENCES finance.ap_payments (payment_id),
    bill_id text NOT NULL REFERENCES finance.ap_invoices (bill_id),
    allocated_amount_inr numeric(20, 2),
    allocation_date date,
    status text,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    UNIQUE (source_filename, source_record_number)
);

CREATE TABLE finance.ap_adjustments (
    adjustment_id text PRIMARY KEY CHECK (btrim(adjustment_id) <> ''),
    bill_id text NOT NULL REFERENCES finance.ap_invoices (bill_id),
    vendor_id text NOT NULL REFERENCES finance.vendor_master (vendor_id),
    adjustment_date date,
    adjustment_type text,
    amount_inr numeric(20, 2),
    reference text,
    status text,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    UNIQUE (source_filename, source_record_number)
);

CREATE TABLE finance.disputes (
    dispute_id text PRIMARY KEY CHECK (btrim(dispute_id) <> ''),
    party_type text NOT NULL CHECK (party_type IN ('Customer', 'Vendor')),
    party_id text NOT NULL CHECK (btrim(party_id) <> ''),
    invoice_id text REFERENCES finance.ar_invoices (invoice_id),
    bill_id text REFERENCES finance.ap_invoices (bill_id),
    raised_date date,
    dispute_reason text,
    disputed_amount_inr numeric(20, 2),
    status text,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    -- Each dispute belongs to exactly one ledger. Party consistency is checked during import.
    CHECK (
        (party_type = 'Customer' AND invoice_id IS NOT NULL AND bill_id IS NULL)
        OR (party_type = 'Vendor' AND bill_id IS NOT NULL AND invoice_id IS NULL)
    ),
    UNIQUE (source_filename, source_record_number)
);

CREATE TABLE finance.collection_followups (
    followup_id text PRIMARY KEY CHECK (btrim(followup_id) <> ''),
    customer_id text NOT NULL REFERENCES finance.customer_master (customer_id),
    invoice_id text NOT NULL REFERENCES finance.ar_invoices (invoice_id),
    followup_date date,
    contact_method text,
    promise_to_pay_date date,
    promised_amount_inr numeric(20, 2),
    followup_status text,
    owner_id text,
    notes text,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    UNIQUE (source_filename, source_record_number)
);

CREATE TABLE finance.payment_holds (
    hold_id text PRIMARY KEY CHECK (btrim(hold_id) <> ''),
    vendor_id text NOT NULL REFERENCES finance.vendor_master (vendor_id),
    bill_id text NOT NULL REFERENCES finance.ap_invoices (bill_id),
    hold_date date,
    hold_reason text,
    hold_status text,
    released_date date,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    UNIQUE (source_filename, source_record_number)
);

CREATE TABLE finance.business_calendar (
    calendar_date date PRIMARY KEY,
    year integer NOT NULL,
    month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
    quarter text NOT NULL CHECK (quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
    is_weekend boolean NOT NULL,
    is_month_end boolean NOT NULL,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    UNIQUE (source_filename, source_record_number)
);

CREATE TABLE finance.import_issues (
    import_issue_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_filename text NOT NULL CHECK (btrim(source_filename) <> ''),
    source_record_number integer NOT NULL CHECK (source_record_number > 0),
    source_id text,
    issue_code text NOT NULL CHECK (btrim(issue_code) <> ''),
    reason text NOT NULL CHECK (btrim(reason) <> ''),
    -- Rejected rows can contain invalid dates or missing parents, so retain their original fields.
    raw_record jsonb NOT NULL CHECK (jsonb_typeof(raw_record) = 'object'),
    recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- These indexes support party drill-down and cutoffs without making business references unique.
CREATE INDEX ar_invoices_customer_posting_idx ON finance.ar_invoices (customer_id, posting_date);
CREATE INDEX ar_invoices_posting_idx ON finance.ar_invoices (posting_date);
CREATE INDEX ar_invoices_due_idx ON finance.ar_invoices (due_date);
CREATE INDEX ar_invoices_number_idx ON finance.ar_invoices (invoice_number);
CREATE INDEX ar_receipts_customer_date_idx ON finance.ar_receipts (customer_id, receipt_date);
CREATE INDEX ar_receipts_date_idx ON finance.ar_receipts (receipt_date);
CREATE INDEX ar_allocations_invoice_date_idx ON finance.ar_receipt_allocations (invoice_id, allocation_date);
CREATE INDEX ar_allocations_receipt_idx ON finance.ar_receipt_allocations (receipt_id);
CREATE INDEX ar_adjustments_invoice_date_idx ON finance.ar_adjustments (invoice_id, adjustment_date);
CREATE INDEX ar_adjustments_customer_idx ON finance.ar_adjustments (customer_id);
CREATE INDEX ap_invoices_vendor_posting_idx ON finance.ap_invoices (vendor_id, posting_date);
CREATE INDEX ap_invoices_posting_idx ON finance.ap_invoices (posting_date);
CREATE INDEX ap_invoices_due_idx ON finance.ap_invoices (due_date);
CREATE INDEX ap_invoices_number_idx ON finance.ap_invoices (bill_number);
CREATE INDEX ap_payments_vendor_date_idx ON finance.ap_payments (vendor_id, payment_date);
CREATE INDEX ap_payments_date_idx ON finance.ap_payments (payment_date);
CREATE INDEX ap_allocations_bill_date_idx ON finance.ap_payment_allocations (bill_id, allocation_date);
CREATE INDEX ap_allocations_payment_idx ON finance.ap_payment_allocations (payment_id);
CREATE INDEX ap_adjustments_bill_date_idx ON finance.ap_adjustments (bill_id, adjustment_date);
CREATE INDEX ap_adjustments_vendor_idx ON finance.ap_adjustments (vendor_id);
CREATE INDEX disputes_invoice_idx ON finance.disputes (invoice_id);
CREATE INDEX disputes_bill_idx ON finance.disputes (bill_id);
CREATE INDEX disputes_party_idx ON finance.disputes (party_type, party_id);
CREATE INDEX followups_invoice_date_idx ON finance.collection_followups (invoice_id, followup_date);
CREATE INDEX followups_customer_date_idx ON finance.collection_followups (customer_id, followup_date);
CREATE INDEX holds_bill_date_idx ON finance.payment_holds (bill_id, hold_date);
CREATE INDEX holds_vendor_idx ON finance.payment_holds (vendor_id);
CREATE INDEX import_issues_source_idx ON finance.import_issues (source_filename, source_record_number);

COMMIT;
