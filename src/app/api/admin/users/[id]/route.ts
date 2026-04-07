import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

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
    logger.warn({ route: 'PATCH /api/admin/users/[id]' }, 'Unauthenticated');
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
    logger.warn({ route: 'PATCH /api/admin/users/[id]', userId: user.id }, 'Forbidden: not admin');
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn({ route: 'PATCH /api/admin/users/[id]', userId: user.id, targetUserId }, 'Validation failed');
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
    logger.warn({ route: 'PATCH /api/admin/users/[id]', userId: user.id, targetUserId }, 'User not found');
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
        logger.warn({ route: 'PATCH /api/admin/users/[id]', userId: user.id, targetUserId }, 'Email already in use');
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
      logger.error({ route: 'PATCH /api/admin/users/[id]', userId: user.id, targetUserId, err: authError }, 'Failed to update auth user');
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
      logger.error({ route: 'PATCH /api/admin/users/[id]', userId: user.id, targetUserId, err: profileError }, 'Failed to update user profile');
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
  }

  logger.info({ route: 'PATCH /api/admin/users/[id]', userId: user.id, targetUserId }, 'User updated');
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
    logger.warn({ route: 'DELETE /api/admin/users/[id]' }, 'Unauthenticated');
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (targetUserId === user.id) {
    logger.warn({ route: 'DELETE /api/admin/users/[id]', userId: user.id, targetUserId }, 'Cannot delete own account');
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
    logger.warn({ route: 'DELETE /api/admin/users/[id]', userId: user.id, targetUserId }, 'Forbidden: not admin');
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", targetUserId)
    .single();

  if (!targetProfile) {
    logger.warn({ route: 'DELETE /api/admin/users/[id]', userId: user.id, targetUserId }, 'User not found');
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const targetIsAdmin =
    targetProfile.roles.includes("admin") ||
    targetProfile.roles.includes("super_admin");

  if (targetIsAdmin && !isSuperAdmin) {
    logger.warn({ route: 'DELETE /api/admin/users/[id]', userId: user.id, targetUserId }, 'Forbidden: only super admins can delete admin users');
    return NextResponse.json(
      { error: "Only super admins can delete admin users" },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId);

  if (deleteError) {
    logger.error({ route: 'DELETE /api/admin/users/[id]', userId: user.id, targetUserId, err: deleteError }, 'Failed to delete user');
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  logger.info({ route: 'DELETE /api/admin/users/[id]', userId: user.id, targetUserId }, 'User deleted');
  return NextResponse.json({ success: true });
}
