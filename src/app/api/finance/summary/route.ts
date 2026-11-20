import { getFinanceSummary } from "@/server/finance/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // This endpoint supplies the portfolio cards from the same balances as the document tables.
  try {
    return Response.json(await getFinanceSummary(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Unable to load financial summary");
    return Response.json({ error: "Financial summary is temporarily unavailable." }, { status: 503 });
  }
}
