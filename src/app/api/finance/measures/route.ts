import { NextRequest, NextResponse } from "next/server";
import { getMeasures } from "@/server/finance/measures";
import type { Ledger } from "@/server/finance/documents";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ledgerParam = searchParams.get("ledger");
    const ledger: Ledger = ledgerParam === "ap" ? "ap" : "ar";

    const data = await getMeasures(ledger);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Measures error:", error);
    return NextResponse.json({ error: "Failed to load measures" }, { status: 500 });
  }
}
