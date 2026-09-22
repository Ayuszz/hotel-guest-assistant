import { NextResponse } from "next/server";
import { handleChat } from "@/server/chat";
import { log } from "@/server/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ type: "error", message: "Body must be valid JSON", code: "INVALID_JSON" }, { status: 400 });
  }
  try {
    const { status, body: res } = await handleChat(body);
    return NextResponse.json(res, { status });
  } catch (e) {
    log("error", "chat.unhandled", { error: (e as Error).message, stack: (e as Error).stack });
    return NextResponse.json({ type: "error", message: "Something went wrong on our side. Please try again.", code: "INTERNAL" }, { status: 500 });
  }
}
