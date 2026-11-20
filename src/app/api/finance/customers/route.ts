import { getCustomerPriorities } from "@/server/finance/customer-priorities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  // GET /api/finance/customers supplies the live collection-priority table.
  try {
    return Response.json(await getCustomerPriorities(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Customer priorities could not be loaded");
    return Response.json({ error: "Customer priorities are unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
