import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const looseUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID",
);

const relationshipEnum = z.enum(["parent", "guardian", "emergency_contact"]);

const createRiderSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  date_of_birth: z.string().optional().or(z.literal("")),
  group_id: looseUuid,
  relationship: relationshipEnum.default("parent"),
  is_primary: z.boolean().default(true),
});

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
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
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { supabase };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: adultId } = await params;
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { data: adult } = await auth.supabase
    .from("profiles")
    .select("id")
    .eq("id", adultId)
    .maybeSingle();

  if (!adult) {
    return NextResponse.json({ error: "Adult not found" }, { status: 404 });
  }

  const { data, error } = await auth.supabase
    .from("rider_parents")
    .select(
      "rider_id, relationship, is_primary, riders:rider_id(id, first_name, last_name, date_of_birth, group_id, groups(id, name, color))",
    )
    .eq("parent_id", adultId)
    .order("is_primary", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type GroupRow = { id: string; name: string; color: string } | null;
  type RiderRow = {
    id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    group_id: string | null;
    groups: GroupRow;
  };

  const riders = (data ?? []).map((row) => {
    const rider = row.riders as unknown as RiderRow;
    const group = rider.groups as unknown as GroupRow;

    return {
      rider_id: row.rider_id,
      first_name: rider.first_name,
      last_name: rider.last_name,
      date_of_birth: rider.date_of_birth,
      group_id: rider.group_id,
      group_name: group?.name ?? null,
      group_color: group?.color ?? null,
      relationship: row.relationship as z.infer<typeof relationshipEnum>,
      is_primary: row.is_primary,
    };
  });

  return NextResponse.json(riders);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: adultId } = await params;
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let payload: z.infer<typeof createRiderSchema>;
  try {
    payload = createRiderSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const { data: adult } = await auth.supabase
    .from("profiles")
    .select("id, roles")
    .eq("id", adultId)
    .maybeSingle();

  if (!adult) {
    return NextResponse.json({ error: "Adult not found" }, { status: 404 });
  }

  const { data: group } = await auth.supabase
    .from("groups")
    .select("id")
    .eq("id", payload.group_id)
    .maybeSingle();

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const { data: rider, error: riderError } = await auth.supabase
    .from("riders")
    .insert({
      first_name: payload.first_name,
      last_name: payload.last_name,
      date_of_birth: payload.date_of_birth || null,
      group_id: payload.group_id,
    })
    .select("id")
    .single();

  if (riderError || !rider) {
    return NextResponse.json(
      { error: riderError?.message ?? "Failed to create rider" },
      { status: 500 },
    );
  }

  const { error: linkError } = await auth.supabase.from("rider_parents").insert({
    rider_id: rider.id,
    parent_id: adultId,
    relationship: payload.relationship,
    is_primary: payload.is_primary,
  });

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  if (!adult.roles.includes("parent")) {
    const mergedRoles = [...new Set([...adult.roles, "parent"])];
    await auth.supabase
      .from("profiles")
      .update({ roles: mergedRoles })
      .eq("id", adultId);
  }

  return NextResponse.json({ success: true, rider_id: rider.id });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: adultId } = await params;
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const riderId = searchParams.get("rider_id");
  const parsedRiderId = looseUuid.safeParse(riderId);

  if (!parsedRiderId.success) {
    return NextResponse.json({ error: "rider_id is required" }, { status: 400 });
  }

  const { data: link } = await auth.supabase
    .from("rider_parents")
    .select("is_primary")
    .eq("rider_id", parsedRiderId.data)
    .eq("parent_id", adultId)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  const { error: deleteError } = await auth.supabase
    .from("rider_parents")
    .delete()
    .eq("rider_id", parsedRiderId.data)
    .eq("parent_id", adultId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (link.is_primary) {
    const { data: remainingLinks } = await auth.supabase
      .from("rider_parents")
      .select("parent_id, is_primary")
      .eq("rider_id", parsedRiderId.data)
      .order("parent_id");

    const links = remainingLinks ?? [];
    if (links.length > 0 && !links.some((l) => l.is_primary)) {
      await auth.supabase
        .from("rider_parents")
        .update({ is_primary: true })
        .eq("rider_id", parsedRiderId.data)
        .eq("parent_id", links[0].parent_id);
    }
  }

  return NextResponse.json({ success: true });
}
