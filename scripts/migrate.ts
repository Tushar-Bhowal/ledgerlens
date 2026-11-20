import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { Client } from "pg";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL_UNPOOLED is required for migrations.");
  }

  const connection = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname)) {
    connection.searchParams.set("sslmode", "verify-full");
  }
  if (connection.hostname.includes("-pooler")) {
    throw new Error("DATABASE_URL_UNPOOLED must use a direct database connection.");
  }

  const directory = path.join(process.cwd(), "db", "migrations");
  const filenames = (await readdir(directory))
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name))
    .sort();
  if (filenames.length === 0) throw new Error("No SQL migrations found.");

  const client = new Client({ connectionString: connection.toString(), connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    // A session lock prevents concurrent runners from applying the same migration twice.
    await client.query("SELECT pg_advisory_lock(hashtext($1))", ["ledgerlens:migrations"]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.ledgerlens_schema_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const existing = await client.query<{ filename: string; checksum: string }>(
      "SELECT filename, checksum FROM public.ledgerlens_schema_migrations",
    );
    const applied = new Map(existing.rows.map((row) => [row.filename, row.checksum]));
    for (const name of applied.keys()) {
      if (!filenames.includes(name)) throw new Error(`Applied migration ${name} is missing from disk.`);
    }

    for (const filename of filenames) {
      const sql = await readFile(path.join(directory, filename), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = applied.get(filename);
      if (previous) {
        if (previous !== checksum) throw new Error(`Applied migration ${filename} has changed.`);
        console.log(`Already applied: ${filename}`);
        continue;
      }
      if (existing.rows.some((row) => row.filename > filename)) {
        throw new Error(`Migration ${filename} precedes an already applied migration.`);
      }

      // The SQL file has its own transaction for manual use. The runner owns it here
      // so a schema change and its migration history are committed together.
      const match = sql.match(/^\s*BEGIN\s*;([\s\S]*)COMMIT\s*;\s*$/i);
      if (!match) throw new Error(`Migration ${filename} must be enclosed in BEGIN and COMMIT.`);
      await client.query("BEGIN");
      try {
        await client.query(match[1]);
        await client.query(
          "INSERT INTO public.ledgerlens_schema_migrations (filename, checksum) VALUES ($1, $2)",
          [filename, checksum],
        );
        await client.query("COMMIT");
        console.log(`Applied: ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

migrate().catch((error: unknown) => {
  console.error("Migration failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
