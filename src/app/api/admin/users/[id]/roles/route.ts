import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { roleUpdateSchema } from "@/lib/validators";
import { logger } from "@/lib/logger";

const ROUTE = 'PATCH /api/admin/users/[id]/roles';

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
    logger.warn({ route: ROUTE }, 'Unauthenticated');
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  const isSuperAdmin = currentProfile?.roles?.includes("super_admin");
  const isAdmin =
    isSuperAdmin || currentProfile?.roles?.includes("admin");

  if (!isAdmin) {
    logger.warn({ route: ROUTE, userId: user.id, targetUserId }, 'Forbidden: not admin');
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = roleUpdateSchema.safeParse(body);

  if (!parsed.success) {
    logger.warn({ route: ROUTE, userId: user.id, targetUserId }, 'Validation failed');
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const newRoles = parsed.data.roles;

  // Get target user's current roles
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", targetUserId)
    .single();

  if (!targetProfile) {
    logger.warn({ route: ROUTE, userId: user.id, targetUserId }, 'User not found');
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Only super_admin can grant/revoke admin or super_admin
  const adminRoles = ["admin", "super_admin"];
  const currentAdminRoles = targetProfile.roles.filter((r: string) =>
    adminRoles.includes(r),
  );
  const newAdminRoles = newRoles.filter((r) => adminRoles.includes(r));

  const adminRolesChanged =
    JSON.stringify(currentAdminRoles.sort()) !==
    JSON.stringify(newAdminRoles.sort());

  if (adminRolesChanged && !isSuperAdmin) {
    logger.warn({ route: ROUTE, userId: user.id, targetUserId }, 'Forbidden: only super admins can modify admin roles');
    return NextResponse.json(
      { error: "Only super admins can modify admin roles" },
      { status: 403 },
    );
  }

  // Prevent removing own super_admin role
  if (
    targetUserId === user.id &&
    isSuperAdmin &&
    !newRoles.includes("super_admin")
  ) {
    logger.warn({ route: ROUTE, userId: user.id, targetUserId }, 'Cannot remove own super admin role');
    return NextResponse.json(
      { error: "Cannot remove your own super admin role" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ roles: newRoles })
    .eq("id", targetUserId);

  if (error) {
    logger.error({ route: ROUTE, userId: user.id, targetUserId, err: error }, 'Failed to update user roles');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info({ route: ROUTE, userId: user.id, targetUserId, newRoles }, 'User roles updated');
  return NextResponse.json({ success: true });
}
