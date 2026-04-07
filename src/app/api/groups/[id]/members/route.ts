import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

// Assign a member to a group
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: groupId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "POST /api/groups/[id]/members" }, "Unauthenticated");
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
    logger.warn({ route: "POST /api/groups/[id]/members", userId: user.id, groupId }, "Forbidden");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { type, member_id } = await request.json();

  if (!type || !member_id) {
    logger.warn({ route: "POST /api/groups/[id]/members", userId: user.id, groupId }, "Missing type or member_id");
    return NextResponse.json(
      { error: "type and member_id are required" },
      { status: 400 },
    );
  }

  if (type === "rider") {
    // Assign minor rider to group
    const { error } = await supabase
      .from("riders")
      .update({ group_id: groupId })
      .eq("id", member_id);

    if (error) {
      logger.error({ route: "POST /api/groups/[id]/members", userId: user.id, groupId, err: error }, "Failed to assign rider to group");
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (type === "adult_rider") {
    // Assign adult rider to group
    const { error } = await supabase
      .from("profiles")
      .update({ rider_group_id: groupId })
      .eq("id", member_id);

    if (error) {
      logger.error({ route: "POST /api/groups/[id]/members", userId: user.id, groupId, err: error }, "Failed to assign adult rider to group");
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (type === "roll_model") {
    // Assign roll model to group
    const { error } = await supabase
      .from("roll_model_groups")
      .insert({ roll_model_id: member_id, group_id: groupId });

    if (error) {
      if (error.code === "23505") {
        logger.warn({ route: "POST /api/groups/[id]/members", userId: user.id, groupId, memberId: member_id }, "Already assigned");
        return NextResponse.json(
          { error: "Already assigned" },
          { status: 409 },
        );
      }
      logger.error({ route: "POST /api/groups/[id]/members", userId: user.id, groupId, err: error }, "Failed to assign roll model to group");
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    logger.warn({ route: "POST /api/groups/[id]/members", userId: user.id, groupId, type }, "Invalid member type");
    return NextResponse.json(
      { error: "Invalid type. Must be rider, adult_rider, or roll_model" },
      { status: 400 },
    );
  }

  logger.info({ route: "POST /api/groups/[id]/members", userId: user.id, groupId, type, memberId: member_id }, "Member assigned to group");
  return NextResponse.json({ success: true });
}

// Remove a member from a group
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: groupId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "DELETE /api/groups/[id]/members" }, "Unauthenticated");
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
    logger.warn({ route: "DELETE /api/groups/[id]/members", userId: user.id, groupId }, "Forbidden");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const memberId = searchParams.get("member_id");

  if (!type || !memberId) {
    logger.warn({ route: "DELETE /api/groups/[id]/members", userId: user.id, groupId }, "Missing type or member_id");
    return NextResponse.json(
      { error: "type and member_id query params are required" },
      { status: 400 },
    );
  }

  if (type === "rider") {
    const { error } = await supabase
      .from("riders")
      .update({ group_id: null })
      .eq("id", memberId)
      .eq("group_id", groupId);

    if (error) {
      logger.error({ route: "DELETE /api/groups/[id]/members", userId: user.id, groupId, err: error }, "Failed to remove rider from group");
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (type === "adult_rider") {
    const { error } = await supabase
      .from("profiles")
      .update({ rider_group_id: null })
      .eq("id", memberId)
      .eq("rider_group_id", groupId);

    if (error) {
      logger.error({ route: "DELETE /api/groups/[id]/members", userId: user.id, groupId, err: error }, "Failed to remove adult rider from group");
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (type === "roll_model") {
    const { error } = await supabase
      .from("roll_model_groups")
      .delete()
      .eq("roll_model_id", memberId)
      .eq("group_id", groupId);

    if (error) {
      logger.error({ route: "DELETE /api/groups/[id]/members", userId: user.id, groupId, err: error }, "Failed to remove roll model from group");
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    logger.warn({ route: "DELETE /api/groups/[id]/members", userId: user.id, groupId, type }, "Invalid member type");
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  logger.info({ route: "DELETE /api/groups/[id]/members", userId: user.id, groupId, type, memberId }, "Member removed from group");
  return NextResponse.json({ success: true });
}
