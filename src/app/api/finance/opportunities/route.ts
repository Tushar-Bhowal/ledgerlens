import { NextResponse } from "next/server";
import { getOpportunities } from "@/server/finance/opportunities";

export async function GET() {
  try {
    const data = await getOpportunities();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Opportunities query failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Failed to load collection opportunities" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
