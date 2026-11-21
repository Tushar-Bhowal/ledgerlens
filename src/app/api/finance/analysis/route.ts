import { NextRequest, NextResponse } from "next/server";
import { getPeriodAnalysis } from "@/server/finance/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ledger = request.nextUrl.searchParams.get("ledger") ?? "ar";
  const rawMonth = request.nextUrl.searchParams.get("month") ?? "12";
  const month = Number(rawMonth);
  if ((ledger !== "ar" && ledger !== "ap") || !/^\d{1,2}$/.test(rawMonth) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Ledger must be ar or ap, and month must be an integer from 1 to 12." }, { status: 400 });
  }
  try {
    return NextResponse.json(await getPeriodAnalysis(ledger, month), { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Period analysis query failed");
    return NextResponse.json({ error: "Failed to load period analysis" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
