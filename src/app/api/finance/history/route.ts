import { getBalanceHistory } from "@/server/finance/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getBalanceHistory(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Unable to load balance history");
    return Response.json({ error: "Balance history is temporarily unavailable." }, { status: 503 });
  }
}
