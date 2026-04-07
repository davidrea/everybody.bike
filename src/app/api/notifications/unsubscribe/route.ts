import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushUnsubscribeSchema } from "@/lib/validators";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "POST /api/notifications/unsubscribe" }, "Unauthenticated");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = pushUnsubscribeSchema.safeParse(body);

  if (!parsed.success) {
    logger.warn({ route: "POST /api/notifications/unsubscribe", userId: user.id }, "Validation failed");
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", parsed.data.endpoint);

  if (error) {
    logger.error({ route: "POST /api/notifications/unsubscribe", userId: user.id, err: error }, "Failed to remove push subscription");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info({ route: "POST /api/notifications/unsubscribe", userId: user.id }, "Push subscription removed");
  return NextResponse.json({ ok: true });
}
