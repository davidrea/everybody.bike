import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { roleUpdateSchema } from "@/lib/validators";

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

  const isSuperAdmin = currentProfile?.roles?.includes("super_admin");
  const isAdmin =
    isSuperAdmin || currentProfile?.roles?.includes("admin");

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = roleUpdateSchema.safeParse(body);

  if (!parsed.success) {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
