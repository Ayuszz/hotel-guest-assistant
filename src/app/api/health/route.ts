import { NextResponse } from "next/server";
import { getProvider } from "@/server/llm";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ status: "ok", provider: getProvider().name, time: new Date().toISOString() });
}
