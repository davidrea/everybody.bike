import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/url";
import { logger } from "@/lib/logger";

const ROUTE = 'POST /api/admin/invite/resend';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: ROUTE }, 'Unauthenticated');
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  const isAdmin =
    profile?.roles?.includes("admin") ||
    profile?.roles?.includes("super_admin");

  if (!isAdmin) {
    logger.warn({ route: ROUTE, userId: user.id }, 'Forbidden: not admin');
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { user_id } = await request.json();

  if (!user_id) {
    logger.warn({ route: ROUTE, userId: user.id }, 'Missing user_id');
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  // Get the target user's email
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("email, invite_status")
    .eq("id", user_id)
    .single();

  if (!targetProfile) {
    logger.warn({ route: ROUTE, userId: user.id, targetUserId: user_id }, 'User not found');
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (targetProfile.invite_status === "accepted") {
    logger.warn({ route: ROUTE, userId: user.id, targetUserId: user_id }, 'User already accepted invite');
    return NextResponse.json(
      { error: "User has already accepted their invite" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const callbackUrl = new URL("/auth/callback", getBaseUrl(request)).toString();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.auth.admin.inviteUserByEmail(targetProfile.email, {
    redirectTo: callbackUrl,
    data: { auth_email_expires_at: expiresAt },
  });

  if (error) {
    logger.error({ route: ROUTE, userId: user.id, targetUserId: user_id, err: error }, 'Failed to resend invite');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update invited_at
  await admin
    .from("profiles")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", user_id);

  logger.info({ route: ROUTE, userId: user.id, targetUserId: user_id }, 'Invite resent');
  return NextResponse.json({ success: true });
}
