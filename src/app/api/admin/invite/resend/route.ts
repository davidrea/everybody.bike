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

  // Get the target user's email
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

  const callbackUrl = new URL("/auth/callback", getBaseUrl(request)).toString();
  const { error } = await supabase.auth.signInWithOtp({
    email: targetProfile.email,
    options: {
      emailRedirectTo: callbackUrl,
      shouldCreateUser: false,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const admin = createAdminClient();
  // Update invited_at
  await admin
    .from("profiles")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", user_id);

  return NextResponse.json({ success: true });
}
