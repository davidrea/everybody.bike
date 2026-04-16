import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { groupSchema } from "@/lib/validators";
import { logger } from "@/lib/logger";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "GET /api/groups" }, "Unauthenticated");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("groups")
    .select("*")
    .order("sort_order")
    .order("name");

  if (error) {
    logger.error({ route: "GET /api/groups", userId: user.id, err: error }, "Failed to fetch groups");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "POST /api/groups" }, "Unauthenticated");
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
    logger.warn({ route: "POST /api/groups", userId: user.id }, "Forbidden");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = groupSchema.safeParse(body);

  if (!parsed.success) {
    logger.warn({ route: "POST /api/groups", userId: user.id }, "Validation failed");
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: maxRow } = await supabase
    .from("groups")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const nextSortOrder = maxRow ? (maxRow.sort_order ?? 0) + 1 : 0;

  const { data, error } = await supabase
    .from("groups")
    .insert({
      name: parsed.data.name,
      color: parsed.data.color,
      description: parsed.data.description || null,
      sort_order: nextSortOrder,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      logger.warn({ route: "POST /api/groups", userId: user.id }, "Duplicate group name");
      return NextResponse.json(
        { error: "A group with this name already exists" },
        { status: 409 },
      );
    }
    logger.error({ route: "POST /api/groups", userId: user.id, err: error }, "Failed to create group");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info({ route: "POST /api/groups", userId: user.id, groupId: data.id }, "Group created");
  return NextResponse.json(data, { status: 201 });
}
