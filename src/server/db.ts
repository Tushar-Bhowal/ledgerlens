import "server-only";
import { Pool } from "pg";

const database = globalThis as typeof globalThis & {
  postgresPool?: Pool;
};

export function getDatabasePool(): Pool {
  if (!database.postgresPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required.");
    let connection: URL;
    try { connection = new URL(databaseUrl); }
    catch { throw new Error("DATABASE_URL must be a valid PostgreSQL URL."); }
    if (!["postgres:", "postgresql:"].includes(connection.protocol)) throw new Error("DATABASE_URL must use PostgreSQL.");
    const localHosts = ["localhost", "127.0.0.1", "[::1]"];
    if (!localHosts.includes(connection.hostname)) {
      connection.searchParams.set("sslmode", "verify-full");
    }

    database.postgresPool = new Pool({
      connectionString: connection.toString(),
      max: 3,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      query_timeout: 10_000,
      statement_timeout: 10_000,
      allowExitOnIdle: true,
    });

    database.postgresPool.on("error", () => {
      console.error("PostgreSQL idle connection error");
    });
  }

  return database.postgresPool;
}
