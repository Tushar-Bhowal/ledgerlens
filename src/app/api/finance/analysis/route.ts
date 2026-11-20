import { NextRequest, NextResponse } from "next/server";
import { getPeriodAnalysis } from "@/server/finance/analysis";
import type { Ledger } from "@/server/finance/documents";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ledgerParam = searchParams.get("ledger");
    const ledger: Ledger = ledgerParam === "ap" ? "ap" : "ar";
    const monthParam = searchParams.get("month");
    const month = monthParam ? Number(monthParam) : 12;

    const data = await getPeriodAnalysis(ledger, month);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Period analysis error:", error);
    return NextResponse.json({ error: "Failed to load period analysis" }, { status: 500 });
  }
}
