import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { type, member_id } = await request.json();

  if (!type || !member_id) {
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (type === "adult_rider") {
    // Assign adult rider to group
    const { error } = await supabase
      .from("profiles")
      .update({ rider_group_id: groupId })
      .eq("id", member_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (type === "roll_model") {
    // Assign roll model to group
    const { error } = await supabase
      .from("roll_model_groups")
      .insert({ roll_model_id: member_id, group_id: groupId });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Already assigned" },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    return NextResponse.json(
      { error: "Invalid type. Must be rider, adult_rider, or roll_model" },
      { status: 400 },
    );
  }

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

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const memberId = searchParams.get("member_id");

  if (!type || !memberId) {
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (type === "adult_rider") {
    const { error } = await supabase
      .from("profiles")
      .update({ rider_group_id: null })
      .eq("id", memberId)
      .eq("rider_group_id", groupId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (type === "roll_model") {
    const { error } = await supabase
      .from("roll_model_groups")
      .delete()
      .eq("roll_model_id", memberId)
      .eq("group_id", groupId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
