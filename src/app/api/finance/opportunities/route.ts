import { NextResponse } from "next/server";
import { getOpportunities } from "@/server/finance/opportunities";

export async function GET() {
  try {
    const data = await getOpportunities();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Opportunities error:", error);
    return NextResponse.json({ error: "Failed to load collection opportunities" }, { status: 500 });
  }
}
