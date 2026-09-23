import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const IdSchema = z.string().uuid();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!IdSchema.safeParse(id).success) {
    return NextResponse.json({ type: "error", message: "Invalid conversation id.", code: "INVALID_REQUEST" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ type: "error", message: "Please sign in.", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: convo } = await admin.from("conversations").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!convo) {
    return NextResponse.json({ type: "error", message: "Conversation not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data, error } = await admin
    .from("messages")
    .select("id, role, content, envelope, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ type: "error", message: "Could not load this conversation.", code: "INTERNAL" }, { status: 500 });
  }
  return NextResponse.json({ messages: data ?? [] });
}
