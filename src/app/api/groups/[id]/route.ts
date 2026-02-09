import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { groupSchema } from "@/lib/validators";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("*")
    .eq("id", id)
    .single();

  if (groupError) {
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
  const parsed = groupSchema.safeParse(body);

  if (!parsed.success) {
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
      return NextResponse.json(
        { error: "A group with this name already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

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

  const { error } = await supabase.from("groups").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
