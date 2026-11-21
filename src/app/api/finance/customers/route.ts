import { getCustomerActivity } from "@/server/finance/customer-activity";
import { getCustomerPriorities } from "@/server/finance/customer-priorities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const customerId = new URL(request.url).searchParams.get("customerId") || undefined;
  if (customerId && !/^C\d{3}$/i.test(customerId)) {
    return Response.json({ error: "Provide a valid customer ID." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const activity = new URL(request.url).searchParams.get("activity") === "true";
  if (activity && !customerId) return Response.json({ error: "Customer ID is required." }, { status: 400 });
  // GET /api/finance/customers supplies the live collection-priority table.
  try {
    return Response.json(await (activity ? getCustomerActivity(customerId!.toUpperCase()) : getCustomerPriorities(customerId?.toUpperCase())), { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Customer priorities could not be loaded");
    return Response.json({ error: "Customer priorities are unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
