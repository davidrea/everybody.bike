import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const looseUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID",
);

const relationshipEnum = z.enum(["parent", "guardian", "emergency_contact"]);

const createRiderSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  date_of_birth: z.string().optional().or(z.literal("")),
  group_id: looseUuid.optional(),
  relationship: relationshipEnum.default("parent"),
  is_primary: z.boolean().default(true),
  medical_alerts: z.string().max(2000).optional().or(z.literal("")),
  media_opt_out: z.boolean().default(false),
});

const updateRiderSchema = z.object({
  rider_id: looseUuid,
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  date_of_birth: z.string().optional().or(z.literal("")),
  relationship: relationshipEnum,
  is_primary: z.boolean(),
  medical_alerts: z.string().max(2000).optional().or(z.literal("")),
  media_opt_out: z.boolean(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("rider_parents")
    .select(
      "rider_id, relationship, is_primary, riders:rider_id(id, first_name, last_name, date_of_birth, group_id, medical_notes, media_opt_out, groups(id, name, color))",
    )
    .eq("parent_id", user.id);

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
    medical_notes: string | null;
    media_opt_out: boolean;
    groups: GroupRow;
  };

  const riders = (data ?? [])
    .map((rp) => {
      const rider = rp.riders as unknown as RiderRow | null;
      if (!rider) return null;
      const group = rider.groups as unknown as GroupRow;
      return {
        rider_id: rp.rider_id,
        first_name: rider.first_name,
        last_name: rider.last_name,
        date_of_birth: rider.date_of_birth,
        group_id: rider.group_id,
        group_name: group?.name ?? null,
        group_color: group?.color ?? null,
        medical_alerts: rider.medical_notes,
        media_opt_out: rider.media_opt_out,
        relationship: rp.relationship,
        is_primary: rp.is_primary,
      };
    })
    .filter(Boolean);

  return NextResponse.json(riders);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof createRiderSchema>;
  try {
    payload = createRiderSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  if (payload.group_id) {
    const { data: group } = await supabase
      .from("groups")
      .select("id")
      .eq("id", payload.group_id)
      .maybeSingle();
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  // Ensure caller has parent role so existing RLS semantics still match.
  if (existingProfile && !existingProfile.roles.includes("parent")) {
    await admin
      .from("profiles")
      .update({ roles: [...new Set([...existingProfile.roles, "parent"])] })
      .eq("id", user.id);
  }

  const { data: rider, error: riderError } = await admin
    .from("riders")
    .insert({
      first_name: payload.first_name,
      last_name: payload.last_name,
      date_of_birth: payload.date_of_birth || null,
      group_id: payload.group_id ?? null,
      medical_notes: payload.medical_alerts?.trim() || null,
      media_opt_out: payload.media_opt_out,
    })
    .select("id")
    .single();

  if (riderError || !rider) {
    return NextResponse.json(
      { error: riderError?.message ?? "Failed to create rider" },
      { status: 500 },
    );
  }

  const { error: linkError } = await admin.from("rider_parents").insert({
    rider_id: rider.id,
    parent_id: user.id,
    relationship: payload.relationship,
    is_primary: payload.is_primary,
  });

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, rider_id: rider.id });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof updateRiderSchema>;
  try {
    payload = updateRiderSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const { data: link } = await supabase
    .from("rider_parents")
    .select("rider_id, is_primary")
    .eq("parent_id", user.id)
    .eq("rider_id", payload.rider_id)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: "Rider link not found" }, { status: 404 });
  }

  const { error: riderError } = await admin
    .from("riders")
    .update({
      first_name: payload.first_name,
      last_name: payload.last_name,
      date_of_birth: payload.date_of_birth || null,
      medical_notes: payload.medical_alerts?.trim() || null,
      media_opt_out: payload.media_opt_out,
    })
    .eq("id", payload.rider_id);

  if (riderError) {
    return NextResponse.json({ error: riderError.message }, { status: 500 });
  }

  if (payload.is_primary) {
    await admin
      .from("rider_parents")
      .update({ is_primary: false })
      .eq("rider_id", payload.rider_id)
      .neq("parent_id", user.id);
  } else if (link.is_primary) {
    const { data: otherPrimary } = await admin
      .from("rider_parents")
      .select("parent_id")
      .eq("rider_id", payload.rider_id)
      .neq("parent_id", user.id)
      .eq("is_primary", true)
      .maybeSingle();

    if (!otherPrimary) {
      return NextResponse.json(
        { error: "Cannot unset the only primary contact for this rider" },
        { status: 400 },
      );
    }
  }

  const { error: linkUpdateError } = await admin
    .from("rider_parents")
    .update({
      relationship: payload.relationship,
      is_primary: payload.is_primary,
    })
    .eq("rider_id", payload.rider_id)
    .eq("parent_id", user.id);

  if (linkUpdateError) {
    return NextResponse.json({ error: linkUpdateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const riderId = searchParams.get("rider_id");
  const parsedRiderId = looseUuid.safeParse(riderId);

  if (!parsedRiderId.success) {
    return NextResponse.json({ error: "rider_id is required" }, { status: 400 });
  }

  const { data: link } = await supabase
    .from("rider_parents")
    .select("is_primary")
    .eq("parent_id", user.id)
    .eq("rider_id", parsedRiderId.data)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: "Rider link not found" }, { status: 404 });
  }

  const { error: unlinkError } = await admin
    .from("rider_parents")
    .delete()
    .eq("parent_id", user.id)
    .eq("rider_id", parsedRiderId.data);

  if (unlinkError) {
    return NextResponse.json({ error: unlinkError.message }, { status: 500 });
  }

  const { data: remainingLinks } = await admin
    .from("rider_parents")
    .select("parent_id, is_primary")
    .eq("rider_id", parsedRiderId.data);

  const links = remainingLinks ?? [];
  if (links.length === 0) {
    // Prevent orphan minor riders when their last parent/guardian unlinks.
    await admin.from("riders").delete().eq("id", parsedRiderId.data);
  } else if (link.is_primary && !links.some((l) => l.is_primary)) {
    await admin
      .from("rider_parents")
      .update({ is_primary: true })
      .eq("rider_id", parsedRiderId.data)
      .eq("parent_id", links[0].parent_id);
  }

  return NextResponse.json({ success: true });
}
