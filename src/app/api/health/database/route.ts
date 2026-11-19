import { getDatabasePool } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getDatabasePool().query<{ connected: number }>(
      "SELECT 1 AS connected",
    );

    if (result.rows[0]?.connected !== 1) {
      throw new Error("Unexpected database response");
    }

    return Response.json(
      { status: "ok", service: "postgres", connected: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error("Database health query failed");

    return Response.json(
      { status: "error", service: "postgres", connected: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
