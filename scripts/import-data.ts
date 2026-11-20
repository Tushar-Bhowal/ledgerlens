import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { parse } from "csv-parse/sync";
import { Client } from "pg";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const tables = [
  "customer_master", "vendor_master", "ar_invoices", "ar_receipts",
  "ar_receipt_allocations", "ar_adjustments", "ap_invoices", "ap_payments",
  "ap_payment_allocations", "ap_adjustments", "disputes", "collection_followups",
  "payment_holds", "business_calendar",
] as const;

type Row = Record<string, string>;
type Column = { column_name: string; data_type: string; is_nullable: string };
type FileData = { table: string; columns: Column[]; rows: Row[] };

function convert(value: string, column: Column): string | boolean | null {
  if (!value.trim()) {
    if (column.is_nullable === "NO") throw new Error(`${column.column_name} is required`);
    return null;
  }
  const text = value.trim();
  if (column.data_type === "numeric") {
    if (!/^-?\d{1,18}(\.\d{1,2})?$/.test(text)) throw new Error(`${column.column_name} must be an exact amount with at most two decimal places`);
    return text;
  }
  if (column.data_type === "integer") {
    if (!/^-?\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < -2147483648 || Number(text) > 2147483647) throw new Error(`${column.column_name} must be a valid integer`);
    return text;
  }
  if (column.data_type === "boolean") {
    if (!/^(true|false)$/i.test(text)) throw new Error(`${column.column_name} must be true or false`);
    return text.toLowerCase() === "true";
  }
  if (column.data_type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${column.column_name} must be a YYYY-MM-DD date`);
    const date = new Date(`${text}T00:00:00Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== text) throw new Error(`${column.column_name} is not a valid date`);
    return text;
  }
  return value;
}

async function importData() {
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
  if (!databaseUrl) throw new Error("DATABASE_URL_UNPOOLED is required.");
  const connection = new URL(databaseUrl);
  if (connection.hostname.includes("-pooler")) throw new Error("Use a direct database connection.");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname)) connection.searchParams.set("sslmode", "verify-full");
  const client = new Client({ connectionString: connection.toString(), connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    const files: FileData[] = [];
    const directory = process.argv[2] ? path.resolve(process.argv[2]) : path.join(process.cwd(), "DDL_Labs_WC_Starter_Data");
    for (const table of tables) {
      const result = await client.query<Column>(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'finance' AND table_name = $1 AND column_name NOT IN ('source_filename', 'source_record_number') ORDER BY ordinal_position",
        [table],
      );
      if (!result.rows.length) throw new Error(`Missing finance table: ${table}. Run migrations first.`);
      const input = await readFile(path.join(directory, `${table}.csv`), "utf8");
      const records = parse(input, { bom: true, skip_empty_lines: true }) as string[][];
      const expected = result.rows.map((column) => column.column_name);
      const header = records.shift();
      if (!header || header.length !== expected.length || header.some((value, index) => value !== expected[index])) throw new Error(`Invalid CSV headers in ${table}.csv`);
      const rows = records.map((fields) => {
        if (fields.length !== expected.length) throw new Error(`Invalid CSV row width in ${table}.csv`);
        return Object.fromEntries(expected.map((name, index) => [name, fields[index]]));
      });
      files.push({ table, columns: result.rows, rows });
    }

    await client.query("BEGIN");
    try {
      // The lock keeps concurrent snapshot replacements from interleaving.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["ledgerlens:import"]);
      await client.query(`TRUNCATE ${[...tables.map((table) => `finance."${table}"`), "finance.import_issues"].join(", ")} RESTART IDENTITY`);
      const summaries: string[] = [];
      // Try whole-file inserts first. If a row is invalid, roll back the batch and
      // use individual savepoints to identify and retain the rejected records.
      await client.query("SAVEPOINT bulk_import");
      let bulkSucceeded = false;
      try {
        for (const file of files) {
          const names = [...file.columns.map((column) => column.column_name), "source_filename", "source_record_number"];
          const params: (string | boolean | null | number)[] = [];
          const groups = file.rows.map((row, index) => {
            const values = [...file.columns.map((column) => convert(row[column.column_name], column)), `${file.table}.csv`, index + 1];
            params.push(...values);
            return `(${values.map((_, position) => `$${index * names.length + position + 1}`).join(", ")})`;
          });
          if (groups.length) await client.query(`INSERT INTO finance."${file.table}" (${names.map((name) => `"${name}"`).join(", ")}) VALUES ${groups.join(", ")}`, params);
        }
        const mismatches = await client.query(`
          SELECT 1 FROM finance.ar_receipt_allocations a JOIN finance.ar_invoices i USING (invoice_id) JOIN finance.ar_receipts r USING (receipt_id) WHERE i.customer_id <> r.customer_id
          UNION ALL SELECT 1 FROM finance.ap_payment_allocations a JOIN finance.ap_invoices i USING (bill_id) JOIN finance.ap_payments p USING (payment_id) WHERE i.vendor_id <> p.vendor_id
          UNION ALL SELECT 1 FROM finance.ar_adjustments a JOIN finance.ar_invoices i USING (invoice_id) WHERE a.customer_id <> i.customer_id
          UNION ALL SELECT 1 FROM finance.ap_adjustments a JOIN finance.ap_invoices i USING (bill_id) WHERE a.vendor_id <> i.vendor_id
          UNION ALL SELECT 1 FROM finance.collection_followups f JOIN finance.ar_invoices i USING (invoice_id) WHERE f.customer_id <> i.customer_id
          UNION ALL SELECT 1 FROM finance.payment_holds h JOIN finance.ap_invoices i USING (bill_id) WHERE h.vendor_id <> i.vendor_id
          UNION ALL SELECT 1 FROM finance.disputes d JOIN finance.ar_invoices i USING (invoice_id) WHERE d.party_id <> i.customer_id
          UNION ALL SELECT 1 FROM finance.disputes d JOIN finance.ap_invoices i USING (bill_id) WHERE d.party_id <> i.vendor_id
          UNION ALL SELECT 1 FROM finance.business_calendar c WHERE c.year <> EXTRACT(YEAR FROM c.calendar_date) OR c.month <> EXTRACT(MONTH FROM c.calendar_date) OR c.quarter <> 'Q' || EXTRACT(QUARTER FROM c.calendar_date)::text OR c.is_weekend <> (EXTRACT(DOW FROM c.calendar_date) IN (0, 6)) OR c.is_month_end <> (EXTRACT(MONTH FROM c.calendar_date + 1) <> c.month)
          LIMIT 1
        `);
        if (mismatches.rowCount) throw new Error("Records require individual validation");
        await client.query(`
          INSERT INTO finance.import_issues (source_filename, source_record_number, source_id, issue_code, reason, raw_record)
          SELECT f.source_filename, f.source_record_number, f.followup_id, 'chronology_warning', 'Event predates its invoice; review before escalation.', to_jsonb(f) - 'source_filename' - 'source_record_number'
          FROM finance.collection_followups f JOIN finance.ar_invoices i USING (invoice_id) WHERE f.followup_date < i.invoice_date
          UNION ALL
          SELECT d.source_filename, d.source_record_number, d.dispute_id, 'chronology_warning', 'Event predates its invoice; review before escalation.', to_jsonb(d) - 'source_filename' - 'source_record_number'
          FROM finance.disputes d JOIN finance.ar_invoices i USING (invoice_id) WHERE d.raised_date < i.invoice_date
        `);
        await client.query("RELEASE SAVEPOINT bulk_import");
        bulkSucceeded = true;
        for (const file of files) summaries.push(`${file.table}.csv: ${file.rows.length} accepted, 0 rejected`);
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT bulk_import");
        await client.query("RELEASE SAVEPOINT bulk_import");
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
        if (code && !["23502", "23503", "23505", "23514", "22003", "22007", "22008"].includes(code)) throw error;
      }
      if (!bulkSucceeded) for (const file of files) {
        let accepted = 0;
        let rejected = 0;
        for (const [index, row] of file.rows.entries()) {
          const filename = `${file.table}.csv`;
          await client.query("SAVEPOINT import_row");
          try {
            const values = file.columns.map((column) => convert(row[column.column_name], column));
            if (file.table === "business_calendar") {
              const date = new Date(`${row.calendar_date}T00:00:00Z`);
              const month = date.getUTCMonth() + 1;
              const isMonthEnd = new Date(date.valueOf() + 86400000).getUTCMonth() !== date.getUTCMonth();
              if (Number(row.year) !== date.getUTCFullYear() || Number(row.month) !== month || row.quarter !== `Q${Math.ceil(month / 3)}` || (row.is_weekend.toLowerCase() === "true") !== [0, 6].includes(date.getUTCDay()) || (row.is_month_end.toLowerCase() === "true") !== isMonthEnd) throw new Error("Calendar fields do not match calendar_date");
            }
            const checks: Record<string, [string, string, string][]> = {
              ar_receipt_allocations: [["ar_receipts", "receipt_id", "customer_id"], ["ar_invoices", "invoice_id", "customer_id"]],
              ap_payment_allocations: [["ap_payments", "payment_id", "vendor_id"], ["ap_invoices", "bill_id", "vendor_id"]],
              ar_adjustments: [["ar_invoices", "invoice_id", "customer_id"]],
              ap_adjustments: [["ap_invoices", "bill_id", "vendor_id"]],
              collection_followups: [["ar_invoices", "invoice_id", "customer_id"]],
              payment_holds: [["ap_invoices", "bill_id", "vendor_id"]],
              disputes: row.party_type === "Customer" ? [["ar_invoices", "invoice_id", "customer_id"]] : [["ap_invoices", "bill_id", "vendor_id"]],
            };
            const parties: string[] = [];
            for (const [parent, key, party] of checks[file.table] ?? []) {
              const found = await client.query(`SELECT "${party}" FROM finance."${parent}" WHERE "${key}" = $1`, [row[key]]);
              if (found.rowCount !== 1) throw new Error(`Missing parent ${key}`);
              parties.push(found.rows[0][party]);
            }
            const directParty = row.customer_id || row.vendor_id || row.party_id;
            if (directParty) parties.push(directParty);
            if (new Set(parties).size > 1) throw new Error("Linked records belong to different parties");
            const names = [...file.columns.map((column) => column.column_name), "source_filename", "source_record_number"];
            const params = [...values, filename, index + 1];
            await client.query(`INSERT INTO finance."${file.table}" (${names.map((name) => `"${name}"`).join(", ")}) VALUES (${params.map((_, position) => `$${position + 1}`).join(", ")})`, params);
            if ((file.table === "collection_followups" && row.followup_date) || (file.table === "disputes" && row.raised_date && row.invoice_id)) {
              const eventDate = file.table === "disputes" ? row.raised_date : row.followup_date;
              const invoice = await client.query<{ invoice_date: string | null }>("SELECT invoice_date::text FROM finance.ar_invoices WHERE invoice_id = $1", [row.invoice_id]);
              if (invoice.rows[0]?.invoice_date && eventDate < invoice.rows[0].invoice_date) {
                await client.query("INSERT INTO finance.import_issues (source_filename, source_record_number, source_id, issue_code, reason, raw_record) VALUES ($1, $2, $3, $4, $5, $6)", [filename, index + 1, row[file.columns[0].column_name], "chronology_warning", "Event predates its invoice; review before escalation.", JSON.stringify(row)]);
              }
            }
            await client.query("RELEASE SAVEPOINT import_row");
            accepted++;
          } catch (error) {
            await client.query("ROLLBACK TO SAVEPOINT import_row");
            const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
            if (code && !["23502", "23503", "23505", "23514", "22003", "22007", "22008"].includes(code)) throw error;
            const message = error instanceof Error ? error.message : "Invalid record";
            await client.query("INSERT INTO finance.import_issues (source_filename, source_record_number, source_id, issue_code, reason, raw_record) VALUES ($1, $2, $3, $4, $5, $6)", [filename, index + 1, row[file.columns[0].column_name] || null, "rejected", message, JSON.stringify(row)]);
            await client.query("RELEASE SAVEPOINT import_row");
            rejected++;
          }
        }
        summaries.push(`${file.table}.csv: ${accepted} accepted, ${rejected} rejected`);
      }
      const warnings = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM finance.import_issues WHERE issue_code = 'chronology_warning'");
      await client.query("COMMIT");
      summaries.forEach((summary) => console.log(summary));
      console.log(`Chronology warnings: ${warnings.rows[0].count}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}

importData().catch((error: unknown) => {
  console.error("Import failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
