import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { groupSchema } from "@/lib/validators";
import { logger } from "@/lib/logger";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "GET /api/groups/[id]" }, "Unauthenticated");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("*")
    .eq("id", id)
    .single();

  if (groupError) {
    if (groupError.code === "PGRST116") {
      logger.warn({ route: "GET /api/groups/[id]", userId: user.id, groupId: id }, "Group not found");
    } else {
      logger.error({ route: "GET /api/groups/[id]", userId: user.id, groupId: id, err: groupError }, "Failed to fetch group");
    }
    return NextResponse.json({ error: groupError.message }, { status: 404 });
  }

  // Minor riders in this group
  const { data: riders } = await supabase
    .from("riders")
    .select("id, first_name, last_name")
    .eq("group_id", id)
    .order("last_name");

  // Adult riders in this group
  const { data: adultRiders } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("rider_group_id", id)
    .order("full_name");

  // Roll models assigned to this group
  const { data: rmGroups } = await supabase
    .from("roll_model_groups")
    .select(
      "roll_model_id, profiles:roll_model_id(id, full_name, email)",
    )
    .eq("group_id", id);

  const rollModels = (rmGroups ?? []).map(
    (rg) => rg.profiles as unknown as { id: string; full_name: string; email: string },
  );

  return NextResponse.json({
    ...group,
    riders: riders ?? [],
    adult_riders: adultRiders ?? [],
    roll_models: rollModels,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "PUT /api/groups/[id]" }, "Unauthenticated");
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
    logger.warn({ route: "PUT /api/groups/[id]", userId: user.id, groupId: id }, "Forbidden");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = groupSchema.safeParse(body);

  if (!parsed.success) {
    logger.warn({ route: "PUT /api/groups/[id]", userId: user.id, groupId: id }, "Validation failed");
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("groups")
    .update({
      name: parsed.data.name,
      color: parsed.data.color,
      description: parsed.data.description || null,
      sort_order: parsed.data.sort_order,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      logger.warn({ route: "PUT /api/groups/[id]", userId: user.id, groupId: id }, "Duplicate group name");
      return NextResponse.json(
        { error: "A group with this name already exists" },
        { status: 409 },
      );
    }
    logger.error({ route: "PUT /api/groups/[id]", userId: user.id, groupId: id, err: error }, "Failed to update group");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info({ route: "PUT /api/groups/[id]", userId: user.id, groupId: id }, "Group updated");
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "DELETE /api/groups/[id]" }, "Unauthenticated");
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
    logger.warn({ route: "DELETE /api/groups/[id]", userId: user.id, groupId: id }, "Forbidden");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("groups").delete().eq("id", id);

  if (error) {
    logger.error({ route: "DELETE /api/groups/[id]", userId: user.id, groupId: id, err: error }, "Failed to delete group");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info({ route: "DELETE /api/groups/[id]", userId: user.id, groupId: id }, "Group deleted");
  return NextResponse.json({ success: true });
}
