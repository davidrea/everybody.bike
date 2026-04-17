import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

const looseUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID",
);

const relationshipEnum = z.enum(["parent", "guardian", "emergency_contact"]);

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
    logger.warn({ route: "GET /api/riders/mine" }, "Unauthenticated");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: adultCheck } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adultCheck) {
    logger.warn({ route: "GET /api/riders/mine", userId: user.id }, "Adult profile not found");
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("rider_parents")
    .select(
      "rider_id, relationship, is_primary, riders:rider_id(id, first_name, last_name, date_of_birth, group_id, medical_notes, media_opt_out, groups(id, name, color))",
    )
    .eq("parent_id", user.id);

  if (error) {
    logger.error({ route: "GET /api/riders/mine", userId: user.id, err: error }, "Failed to fetch riders");
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

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "PATCH /api/riders/mine" }, "Unauthenticated");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof updateRiderSchema>;
  try {
    payload = updateRiderSchema.parse(await request.json());
  } catch {
    logger.warn({ route: "PATCH /api/riders/mine", userId: user.id }, "Validation failed");
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const { data: link } = await supabase
    .from("rider_parents")
    .select("rider_id, is_primary")
    .eq("parent_id", user.id)
    .eq("rider_id", payload.rider_id)
    .maybeSingle();

  if (!link) {
    logger.warn({ route: "PATCH /api/riders/mine", userId: user.id, riderId: payload.rider_id }, "Rider link not found");
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
    logger.error({ route: "PATCH /api/riders/mine", userId: user.id, riderId: payload.rider_id, err: riderError }, "Failed to update rider");
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
      logger.warn({ route: "PATCH /api/riders/mine", userId: user.id, riderId: payload.rider_id }, "Cannot unset only primary contact");
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
    logger.error({ route: "PATCH /api/riders/mine", userId: user.id, riderId: payload.rider_id, err: linkUpdateError }, "Failed to update rider link");
    return NextResponse.json({ error: linkUpdateError.message }, { status: 500 });
  }

  logger.info({ route: "PATCH /api/riders/mine", userId: user.id, riderId: payload.rider_id }, "Rider updated");
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "DELETE /api/riders/mine" }, "Unauthenticated");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const riderId = searchParams.get("rider_id");
  const parsedRiderId = looseUuid.safeParse(riderId);

  if (!parsedRiderId.success) {
    logger.warn({ route: "DELETE /api/riders/mine", userId: user.id }, "Missing or invalid rider_id");
    return NextResponse.json({ error: "rider_id is required" }, { status: 400 });
  }

  const { data: link } = await supabase
    .from("rider_parents")
    .select("is_primary")
    .eq("parent_id", user.id)
    .eq("rider_id", parsedRiderId.data)
    .maybeSingle();

  if (!link) {
    logger.warn({ route: "DELETE /api/riders/mine", userId: user.id, riderId: parsedRiderId.data }, "Rider link not found");
    return NextResponse.json({ error: "Rider link not found" }, { status: 404 });
  }

  const { error: unlinkError } = await admin
    .from("rider_parents")
    .delete()
    .eq("parent_id", user.id)
    .eq("rider_id", parsedRiderId.data);

  if (unlinkError) {
    logger.error({ route: "DELETE /api/riders/mine", userId: user.id, riderId: parsedRiderId.data, err: unlinkError }, "Failed to unlink rider");
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

  logger.info({ route: "DELETE /api/riders/mine", userId: user.id, riderId: parsedRiderId.data }, "Rider unlinked");
  return NextResponse.json({ success: true });
}
