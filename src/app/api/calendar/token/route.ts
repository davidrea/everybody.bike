import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "GET /api/calendar/token" }, "Unauthenticated");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("calendar_token")
    .eq("id", user.id)
    .single();

  if (!profile) {
    logger.warn({ route: "GET /api/calendar/token", userId: user.id }, "Profile not found");
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({ token: profile.calendar_token });
}

// Regenerate the calendar token, invalidating the old feed URL
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "POST /api/calendar/token" }, "Unauthenticated");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ calendar_token: crypto.randomUUID() })
    .eq("id", user.id)
    .select("calendar_token")
    .single();

  if (error) {
    logger.error({ route: "POST /api/calendar/token", userId: user.id, err: error }, "Failed to regenerate calendar token");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info({ route: "POST /api/calendar/token", userId: user.id }, "Calendar token regenerated");
  return NextResponse.json({ token: data.calendar_token });
}
