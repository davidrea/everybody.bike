import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushSubscriptionSchema } from "@/lib/validators";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

// 10 subscription attempts per 5 minutes per IP
const limiter = createRateLimiter({ windowMs: 5 * 60_000, max: 10 });

export async function POST(request: Request) {
  if (!limiter.check(getClientIp(request))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = pushSubscriptionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    subscription: { endpoint, keys },
    user_agent,
  } = parsed.data;

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint,
        keys_p256dh: keys.p256dh,
        keys_auth: keys.auth,
        user_agent: user_agent ?? request.headers.get("user-agent"),
      },
      { onConflict: "endpoint" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
