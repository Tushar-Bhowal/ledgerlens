import { NextResponse } from "next/server";
import { getExceptions } from "@/server/finance/exceptions";

export async function GET() {
  try {
    const data = await getExceptions();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Exceptions error:", error);
    return NextResponse.json({ error: "Failed to load exceptions" }, { status: 500 });
  }
}
