import { getAgeing } from "@/server/finance/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ledger = params.get("ledger");
  const basis = params.get("basis") ?? "due";
  const raw = params.get("boundaries") ?? "30,60,90";
  const parts = raw.split(",");
  const boundaries = parts.map(Number);
  if ((ledger !== "ar" && ledger !== "ap") || (basis !== "due" && basis !== "date" && basis !== "posted" && basis !== "last")
    || parts.length !== 3 || parts.some((part) => !/^\d{1,4}$/.test(part))
    || boundaries.some((value) => value < 1 || value > 3650)
    || boundaries[0] >= boundaries[1] || boundaries[1] >= boundaries[2]) {
    return Response.json({ error: "Invalid ageing filters." }, { status: 400 });
  }

  try {
    const result = await getAgeing(ledger, basis, boundaries as [number, number, number]);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Unable to load ageing analysis");
    return Response.json({ error: "Ageing analysis is temporarily unavailable." }, { status: 503 });
  }
}
