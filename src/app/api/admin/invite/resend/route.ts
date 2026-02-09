import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(
    targetProfile.email,
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update invited_at
  await admin
    .from("profiles")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", user_id);

  return NextResponse.json({ success: true });
}
