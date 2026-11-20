import { NextRequest, NextResponse } from "next/server";
import { processAgentMessage } from "@/server/agent/chat";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { question?: string; lastExampleId?: string };
    const question = (body.question || "").trim();

    if (!question) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    const reply = await processAgentMessage(question, body.lastExampleId);
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Assistant chat error:", error);
    return NextResponse.json({ reply: { kind: "service-error" } }, { status: 500 });
  }
}
