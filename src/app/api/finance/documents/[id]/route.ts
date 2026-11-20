import { getDocumentEvidence, reportingDate, type Ledger } from "@/server/finance/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // GET /api/finance/documents/[id] supplies the allocations and adjustments for one record.
  const ledger = new URL(request.url).searchParams.get("ledger");
  const { id } = await params;
  if ((ledger !== "ar" && ledger !== "ap") || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
    return Response.json({ error: "Invalid document request." }, { status: 400 });
  }
  try {
    const document = await getDocumentEvidence(ledger as Ledger, id);
    if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
    return Response.json({ asOf: reportingDate, document }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Unable to load financial document evidence");
    return Response.json({ error: "Document evidence is temporarily unavailable." }, { status: 503 });
  }
}
