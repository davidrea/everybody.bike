import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notificationPreferencesSchema } from "@/lib/validators";
import { logger } from "@/lib/logger";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "GET /api/notifications/preferences" }, "Unauthenticated");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    logger.error({ route: "GET /api/notifications/preferences", userId: user.id, err: error }, "Failed to fetch notification preferences");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data) {
    return NextResponse.json(data);
  }

  const { data: created, error: insertError } = await supabase
    .from("notification_preferences")
    .insert({ user_id: user.id })
    .select()
    .single();

  if (insertError) {
    logger.error({ route: "GET /api/notifications/preferences", userId: user.id, err: insertError }, "Failed to create notification preferences");
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(created);
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "PATCH /api/notifications/preferences" }, "Unauthenticated");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = notificationPreferencesSchema.safeParse(body);

  if (!parsed.success) {
    logger.warn({ route: "PATCH /api/notifications/preferences", userId: user.id }, "Validation failed");
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: user.id, ...parsed.data }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    logger.error({ route: "PATCH /api/notifications/preferences", userId: user.id, err: error }, "Failed to update notification preferences");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info({ route: "PATCH /api/notifications/preferences", userId: user.id }, "Notification preferences updated");
  return NextResponse.json(data);
}
