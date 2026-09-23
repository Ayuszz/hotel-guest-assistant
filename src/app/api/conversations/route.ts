import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ type: "error", message: "Please sign in.", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ type: "error", message: "Could not load your conversations.", code: "INTERNAL" }, { status: 500 });
  }
  return NextResponse.json({ conversations: data ?? [] });
}
