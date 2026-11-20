import { listDocuments, type Ledger } from "@/server/finance/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // GET /api/finance/documents supplies one filtered page of AR invoices or AP bills.
  const params = new URL(request.url).searchParams;
  const ledger = params.get("ledger");
  const pageText = params.get("page") ?? "1";
  const sizeText = params.get("pageSize") ?? "20";
  const search = params.get("search")?.trim() ?? "";
  const status = params.get("status") ?? "all";
  const partyId = params.get("partyId") ?? "";
  const sort = params.get("sort") ?? "number";
  const direction = params.get("direction") ?? "asc";
  // Bound the work a request can ask the database to do before passing filters to SQL.
  if ((ledger !== "ar" && ledger !== "ap") || !/^[1-9]\d{0,5}$/.test(pageText)
    || !/^[1-9]\d{0,2}$/.test(sizeText) || Number(sizeText) > 100 || search.length > 100
    || !["all", "overdue", "current", "settled", "credit", "unknown"].includes(status)
    || (partyId !== "" && !/^[a-zA-Z0-9_-]{1,80}$/.test(partyId))
    || !["number", "due", "outstanding"].includes(sort) || !["asc", "desc"].includes(direction)) {
    return Response.json({ error: "Invalid document filters." }, { status: 400 });
  }
  try {
    const result = await listDocuments(ledger as Ledger, Number(pageText), Number(sizeText), search, status, partyId, sort as "number" | "due" | "outstanding", direction as "asc" | "desc");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Unable to load financial documents");
    return Response.json({ error: "Financial documents are temporarily unavailable." }, { status: 503 });
  }
}
