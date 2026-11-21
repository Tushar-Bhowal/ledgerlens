import { loadEnvConfig } from "@next/env";
import { Client } from "pg";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

async function resetData() {
  if (!process.argv.includes("--confirm")) {
    throw new Error("This deletes all imported finance data. Run npm run db:reset -- --confirm to proceed.");
  }
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
  if (!databaseUrl) throw new Error("DATABASE_URL_UNPOOLED is required.");
  const connection = new URL(databaseUrl);
  if (connection.hostname.includes("-pooler")) throw new Error("Use a direct database connection.");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname)) connection.searchParams.set("sslmode", "verify-full");
  const client = new Client({ connectionString: connection.toString(), connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["ledgerlens:import"]);
    await client.query(`TRUNCATE finance.customer_master, finance.vendor_master, finance.ar_invoices,
      finance.ar_receipts, finance.ar_receipt_allocations, finance.ar_adjustments, finance.ap_invoices,
      finance.ap_payments, finance.ap_payment_allocations, finance.ap_adjustments, finance.disputes,
      finance.collection_followups, finance.payment_holds, finance.business_calendar, finance.import_issues RESTART IDENTITY`);
    await client.query("COMMIT");
    console.log("Finance data cleared. Run npm run import:data to reload the CSV snapshot.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

resetData().catch((error: unknown) => {
  console.error("Reset failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
