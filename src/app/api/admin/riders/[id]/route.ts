import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: 'PATCH /api/admin/riders/[id]' }, 'Unauthenticated');
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
    logger.warn({ route: 'PATCH /api/admin/riders/[id]', userId: user.id }, 'Forbidden: not admin');
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { group_id } = body;

  if (!group_id || typeof group_id !== "string") {
    logger.warn({ route: 'PATCH /api/admin/riders/[id]', userId: user.id, riderId: id }, 'Missing or invalid group_id');
    return NextResponse.json(
      { error: "group_id is required" },
      { status: 400 },
    );
  }

  // Verify group exists
  const { data: group } = await supabase
    .from("groups")
    .select("id")
    .eq("id", group_id)
    .single();

  if (!group) {
    logger.warn({ route: 'PATCH /api/admin/riders/[id]', userId: user.id, riderId: id, groupId: group_id }, 'Group not found');
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("riders")
    .update({ group_id })
    .eq("id", id);

  if (error) {
    logger.error({ route: 'PATCH /api/admin/riders/[id]', userId: user.id, riderId: id, err: error }, 'Failed to update rider group');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info({ route: 'PATCH /api/admin/riders/[id]', userId: user.id, riderId: id, groupId: group_id }, 'Rider group updated');
  return NextResponse.json({ success: true });
}
