import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteSchema } from "@/lib/validators";
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

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { full_name, email, roles } = parsed.data;

  // Check if user already exists
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const callbackUrl = new URL("/auth/callback", getBaseUrl(request)).toString();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      data: { full_name, auth_email_expires_at: expiresAt },
      redirectTo: callbackUrl,
    },
  );

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  const invitedUserId = inviteData.user?.id;

  if (!invitedUserId) {
    return NextResponse.json(
      { error: "Invite was sent but user ID was not returned" },
      { status: 500 },
    );
  }

  // Update the profile with roles and invite metadata
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name,
      roles,
      invite_status: "pending",
      invited_at: new Date().toISOString(),
      invited_by: user.id,
    })
    .eq("id", invitedUserId);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ id: invitedUserId }, { status: 201 });
}
