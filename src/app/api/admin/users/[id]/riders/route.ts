import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

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

async function requireAdmin(route: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route }, 'Unauthenticated');
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
    logger.warn({ route, userId: user.id }, 'Forbidden: not admin');
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, userId: user.id };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: adultId } = await params;
  const route = 'GET /api/admin/users/[id]/riders';
  const auth = await requireAdmin(route);
  if ("error" in auth) return auth.error;

  const { data: adult } = await auth.supabase
    .from("profiles")
    .select("id")
    .eq("id", adultId)
    .maybeSingle();

  if (!adult) {
    logger.warn({ route, userId: auth.userId, adultId }, 'Adult not found');
    return NextResponse.json({ error: "Adult not found" }, { status: 404 });
  }

  const { data, error } = await auth.supabase
    .from("rider_parents")
    .select(
      "rider_id, relationship, is_primary, riders:rider_id(id, first_name, last_name, date_of_birth, group_id, medical_notes, media_opt_out, groups(id, name, color))",
    )
    .eq("parent_id", adultId)
    .order("is_primary", { ascending: false });

  if (error) {
    logger.error({ route, userId: auth.userId, adultId, err: error }, 'Failed to fetch riders for user');
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
      medical_alerts: rider.medical_notes,
      media_opt_out: rider.media_opt_out,
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
  const route = 'POST /api/admin/users/[id]/riders';
  const auth = await requireAdmin(route);
  if ("error" in auth) return auth.error;

  let payload: z.infer<typeof createRiderSchema>;
  try {
    payload = createRiderSchema.parse(await request.json());
  } catch {
    logger.warn({ route, userId: auth.userId, adultId }, 'Invalid request payload');
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const { data: adult } = await auth.supabase
    .from("profiles")
    .select("id, roles")
    .eq("id", adultId)
    .maybeSingle();

  if (!adult) {
    logger.warn({ route, userId: auth.userId, adultId }, 'Adult not found');
    return NextResponse.json({ error: "Adult not found" }, { status: 404 });
  }

  const { data: group } = await auth.supabase
    .from("groups")
    .select("id")
    .eq("id", payload.group_id)
    .maybeSingle();

  if (!group) {
    logger.warn({ route, userId: auth.userId, adultId, groupId: payload.group_id }, 'Group not found');
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const { data: rider, error: riderError } = await auth.supabase
    .from("riders")
    .insert({
      first_name: payload.first_name,
      last_name: payload.last_name,
      date_of_birth: payload.date_of_birth || null,
      group_id: payload.group_id,
      medical_notes: payload.medical_alerts?.trim() || null,
      media_opt_out: payload.media_opt_out,
    })
    .select("id")
    .single();

  if (riderError || !rider) {
    logger.error({ route, userId: auth.userId, adultId, err: riderError }, 'Failed to create rider');
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
    logger.error({ route, userId: auth.userId, adultId, riderId: rider.id, err: linkError }, 'Failed to link rider to parent');
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  if (!adult.roles.includes("parent")) {
    const mergedRoles = [...new Set([...adult.roles, "parent"])];
    await auth.supabase
      .from("profiles")
      .update({ roles: mergedRoles })
      .eq("id", adultId);
  }

  logger.info({ route, userId: auth.userId, adultId, riderId: rider.id }, 'Rider created and linked to parent');
  return NextResponse.json({ success: true, rider_id: rider.id });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: adultId } = await params;
  const route = 'DELETE /api/admin/users/[id]/riders';
  const auth = await requireAdmin(route);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const riderId = searchParams.get("rider_id");
  const parsedRiderId = looseUuid.safeParse(riderId);

  if (!parsedRiderId.success) {
    logger.warn({ route, userId: auth.userId, adultId }, 'Missing or invalid rider_id');
    return NextResponse.json({ error: "rider_id is required" }, { status: 400 });
  }

  const { data: link } = await auth.supabase
    .from("rider_parents")
    .select("is_primary")
    .eq("rider_id", parsedRiderId.data)
    .eq("parent_id", adultId)
    .maybeSingle();

  if (!link) {
    logger.warn({ route, userId: auth.userId, adultId, riderId: parsedRiderId.data }, 'Link not found');
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  const { error: deleteError } = await auth.supabase
    .from("rider_parents")
    .delete()
    .eq("rider_id", parsedRiderId.data)
    .eq("parent_id", adultId);

  if (deleteError) {
    logger.error({ route, userId: auth.userId, adultId, riderId: parsedRiderId.data, err: deleteError }, 'Failed to delete rider link');
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

  logger.info({ route, userId: auth.userId, adultId, riderId: parsedRiderId.data }, 'Rider link deleted');
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: adultId } = await params;
  const route = 'PATCH /api/admin/users/[id]/riders';
  const auth = await requireAdmin(route);
  if ("error" in auth) return auth.error;

  let payload: z.infer<typeof updateRiderSchema>;
  try {
    payload = updateRiderSchema.parse(await request.json());
  } catch {
    logger.warn({ route, userId: auth.userId, adultId }, 'Invalid request payload');
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const { data: link } = await auth.supabase
    .from("rider_parents")
    .select("is_primary")
    .eq("parent_id", adultId)
    .eq("rider_id", payload.rider_id)
    .maybeSingle();

  if (!link) {
    logger.warn({ route, userId: auth.userId, adultId, riderId: payload.rider_id }, 'Rider link not found');
    return NextResponse.json({ error: "Rider link not found" }, { status: 404 });
  }

  const { error: riderError } = await auth.supabase
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
    logger.error({ route, userId: auth.userId, adultId, riderId: payload.rider_id, err: riderError }, 'Failed to update rider');
    return NextResponse.json({ error: riderError.message }, { status: 500 });
  }

  if (payload.is_primary) {
    await auth.supabase
      .from("rider_parents")
      .update({ is_primary: false })
      .eq("rider_id", payload.rider_id)
      .neq("parent_id", adultId);
  } else if (link.is_primary) {
    const { data: otherPrimary } = await auth.supabase
      .from("rider_parents")
      .select("parent_id")
      .eq("rider_id", payload.rider_id)
      .neq("parent_id", adultId)
      .eq("is_primary", true)
      .maybeSingle();

    if (!otherPrimary) {
      logger.warn({ route, userId: auth.userId, adultId, riderId: payload.rider_id }, 'Cannot unset the only primary contact for this rider');
      return NextResponse.json(
        { error: "Cannot unset the only primary contact for this rider" },
        { status: 400 },
      );
    }
  }

  const { error: linkError } = await auth.supabase
    .from("rider_parents")
    .update({
      relationship: payload.relationship,
      is_primary: payload.is_primary,
    })
    .eq("parent_id", adultId)
    .eq("rider_id", payload.rider_id);

  if (linkError) {
    logger.error({ route, userId: auth.userId, adultId, riderId: payload.rider_id, err: linkError }, 'Failed to update rider link');
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  logger.info({ route, userId: auth.userId, adultId, riderId: payload.rider_id }, 'Rider updated');
  return NextResponse.json({ success: true });
}
