import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { handleCreateBooking, type Booking } from "@/server/bookings";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ type: "error", message: "Please sign in.", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ type: "error", message: "Body must be valid JSON", code: "INVALID_JSON" }, { status: 400 });
  }

  const admin = createAdminClient();
  const table = {
    insert: async (row: Record<string, unknown>) => {
      const { data, error } = await admin.from("bookings").insert(row).select().single();
      return { data: data as Booking | null, error };
    },
  };
  const { status, body: res } = await handleCreateBooking(body, user.id, table);
  return NextResponse.json(res, { status });
}

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
    .from("bookings")
    .select("id, room_id, room_name, check_in, check_out, nights, adults, price_per_night, total_price, currency, status, payment_status, payment_reference, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ type: "error", message: "Could not load your bookings.", code: "INTERNAL" }, { status: 500 });
  }
  return NextResponse.json({ bookings: data ?? [] });
}
