import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const updateUserSchema = z.object({
  full_name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().optional(),
  medical_alerts: z.string().max(2000).optional().or(z.literal("")),
  media_opt_out: z.boolean().optional(),
}).refine(
  (data) =>
    data.full_name !== undefined ||
    data.email !== undefined ||
    data.medical_alerts !== undefined ||
    data.media_opt_out !== undefined,
  {
  message: "At least one field is required",
  },
);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: targetUserId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  const isAdmin =
    currentProfile?.roles?.includes("admin") ||
    currentProfile?.roles?.includes("super_admin");

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("id", targetUserId)
    .single();

  if (!targetProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const updates: {
    full_name?: string;
    email?: string;
    medical_alerts?: string | null;
    media_opt_out?: boolean;
  } = {};
  const authUpdates: {
    email?: string;
    user_metadata?: { full_name: string };
  } = {};

  if (parsed.data.full_name) {
    updates.full_name = parsed.data.full_name;
    authUpdates.user_metadata = { full_name: parsed.data.full_name };
  }

  if (parsed.data.email) {
    const normalizedEmail = parsed.data.email.toLowerCase();
    if (normalizedEmail !== targetProfile.email.toLowerCase()) {
      const { data: existingEmailProfile } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", normalizedEmail)
        .neq("id", targetUserId)
        .maybeSingle();

      if (existingEmailProfile) {
        return NextResponse.json(
          { error: "A user with this email address already exists" },
          { status: 409 },
        );
      }

      updates.email = normalizedEmail;
      authUpdates.email = normalizedEmail;
    }
  }

  if (parsed.data.medical_alerts !== undefined) {
    const trimmed = parsed.data.medical_alerts.trim();
    updates.medical_alerts = trimmed.length > 0 ? trimmed : null;
  }

  if (parsed.data.media_opt_out !== undefined) {
    updates.media_opt_out = parsed.data.media_opt_out;
  }

  if (authUpdates.email || authUpdates.user_metadata) {
    const { error: authError } = await admin.auth.admin.updateUserById(
      targetUserId,
      authUpdates,
    );
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
  }

  if (
    updates.full_name !== undefined ||
    updates.email !== undefined ||
    updates.medical_alerts !== undefined ||
    updates.media_opt_out !== undefined
  ) {
    const { error: profileError } = await admin
      .from("profiles")
      .update(updates)
      .eq("id", targetUserId);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: targetUserId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 },
    );
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  const isSuperAdmin = currentProfile?.roles?.includes("super_admin");
  const isAdmin = isSuperAdmin || currentProfile?.roles?.includes("admin");

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", targetUserId)
    .single();

  if (!targetProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const targetIsAdmin =
    targetProfile.roles.includes("admin") ||
    targetProfile.roles.includes("super_admin");

  if (targetIsAdmin && !isSuperAdmin) {
    return NextResponse.json(
      { error: "Only super admins can delete admin users" },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
