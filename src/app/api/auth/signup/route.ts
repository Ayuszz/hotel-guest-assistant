import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { handleSignup } from "@/server/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ type: "error", message: "Body must be valid JSON", code: "INVALID_JSON" }, { status: 400 });
  }
  const admin = createAdminClient();
  const supabase = await createClient();
  const { status, body: res } = await handleSignup(body, { admin: admin.auth.admin, session: supabase.auth });
  return NextResponse.json(res, { status });
}
