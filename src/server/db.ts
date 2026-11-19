import "server-only";
import { parseEnv } from "@neon/env";
import { Pool } from "pg";
import config from "../../neon";

const database = globalThis as typeof globalThis & {
  postgresPool?: Pool;
};

export function getDatabasePool(): Pool {
  if (!database.postgresPool) {
    const { postgres } = parseEnv(config, ["DATABASE_URL"]);
    const connection = new URL(postgres.databaseUrl);
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
      allowExitOnIdle: true,
    });

    database.postgresPool.on("error", () => {
      console.error("PostgreSQL idle connection error");
    });
  }

  return database.postgresPool;
}
