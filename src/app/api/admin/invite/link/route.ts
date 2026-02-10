import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/url";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { user_id } = await request.json();

  if (!user_id) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("email, invite_status")
    .eq("id", user_id)
    .single();

  if (!targetProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (targetProfile.invite_status === "accepted") {
    return NextResponse.json(
      { error: "User has already accepted their invite" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const callbackUrl = new URL("/auth/callback", getBaseUrl(request)).toString();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: targetProfile.email,
    options: {
      redirectTo: callbackUrl,
      data: { auth_email_expires_at: expiresAt },
    },
  });

  if (linkError || !linkData) {
    return NextResponse.json(
      { error: linkError?.message ?? "Failed to generate invite link" },
      { status: 500 },
    );
  }

  const configuredBase = new URL(getBaseUrl(request));
  const actionUrl = new URL(linkData.properties.action_link);
  actionUrl.protocol = configuredBase.protocol;
  actionUrl.host = configuredBase.host;

  await admin
    .from("profiles")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", user_id);

  return NextResponse.json({ link: actionUrl.toString() });
}
