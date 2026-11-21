import { getCashEvidence } from "@/server/finance/cash-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "no-store" };
  if (!/^(ARR|APP)\d{5}$/i.test(id)) return Response.json({ error: "Invalid cash reference." }, { status: 400, headers });
  try {
    const evidence = await getCashEvidence(id);
    if (!evidence) return Response.json({ error: "Cash record not found." }, { status: 404, headers });
    return Response.json(evidence, { headers });
  } catch {
    console.error("Unable to load cash evidence");
    return Response.json({ error: "Cash evidence is temporarily unavailable." }, { status: 503, headers });
  }
}
