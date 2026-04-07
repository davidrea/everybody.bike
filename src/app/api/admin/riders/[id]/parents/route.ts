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

const createLinkSchema = z.object({
  adult_id: looseUuid,
  relationship: relationshipEnum.default("parent"),
  is_primary: z.boolean().default(false),
});

const updateLinkSchema = z.object({
  adult_id: looseUuid,
  relationship: relationshipEnum,
  is_primary: z.boolean(),
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  const isAdmin =
    profile?.roles?.includes("admin") ||
    profile?.roles?.includes("super_admin");

  if (!isAdmin) {
    logger.warn({ route, userId: user.id }, 'Forbidden: not admin');
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { admin: createAdminClient(), userId: user.id };
}

async function ensureRiderAndAdultExist(
  admin: ReturnType<typeof createAdminClient>,
  riderId: string,
  adultId: string,
) {
  const { data: rider } = await admin
    .from("riders")
    .select("id")
    .eq("id", riderId)
    .maybeSingle();

  if (!rider) {
    return {
      error: NextResponse.json({ error: "Rider not found" }, { status: 404 }),
    };
  }

  const { data: adult } = await admin
    .from("profiles")
    .select("id, roles")
    .eq("id", adultId)
    .maybeSingle();

  if (!adult) {
    return {
      error: NextResponse.json({ error: "Adult not found" }, { status: 404 }),
    };
  }

  return { adult };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: riderId } = await params;
  const route = 'POST /api/admin/riders/[id]/parents';
  const auth = await requireAdmin(route);
  if ("error" in auth) return auth.error;

  let payload: z.infer<typeof createLinkSchema>;
  try {
    payload = createLinkSchema.parse(await request.json());
  } catch {
    logger.warn({ route, userId: auth.userId, riderId }, 'Invalid request payload');
    return NextResponse.json(
      { error: "adult_id is required and relationship/is_primary are invalid" },
      { status: 400 },
    );
  }

  const check = await ensureRiderAndAdultExist(auth.admin, riderId, payload.adult_id);
  if ("error" in check) return check.error;

  const { data: existingLinks, error: existingLinksError } = await auth.admin
    .from("rider_parents")
    .select("parent_id, is_primary")
    .eq("rider_id", riderId);

  if (existingLinksError) {
    logger.error({ route, userId: auth.userId, riderId, err: existingLinksError }, 'Failed to fetch existing parent links');
    return NextResponse.json({ error: existingLinksError.message }, { status: 500 });
  }

  const riderLinks = existingLinks ?? [];
  const existingLink = riderLinks.find(
    (link) => link.parent_id === payload.adult_id,
  );

  if (existingLink) {
    logger.warn({ route, userId: auth.userId, riderId, adultId: payload.adult_id }, 'Adult already linked to rider');
    return NextResponse.json(
      { error: "Adult is already linked to this rider" },
      { status: 409 },
    );
  }

  const shouldBePrimary =
    payload.is_primary ||
    riderLinks.length === 0 ||
    !riderLinks.some((link) => link.is_primary);

  if (shouldBePrimary) {
    const { error: clearPrimaryError } = await auth.admin
      .from("rider_parents")
      .update({ is_primary: false })
      .eq("rider_id", riderId);

    if (clearPrimaryError) {
      logger.error({ route, userId: auth.userId, riderId, err: clearPrimaryError }, 'Failed to clear existing primary parent');
      return NextResponse.json(
        { error: clearPrimaryError.message },
        { status: 500 },
      );
    }
  }

  const { error: insertError } = await auth.admin.from("rider_parents").insert({
    rider_id: riderId,
    parent_id: payload.adult_id,
    relationship: payload.relationship,
    is_primary: shouldBePrimary,
  });

  if (insertError) {
    logger.error({ route, userId: auth.userId, riderId, adultId: payload.adult_id, err: insertError }, 'Failed to insert parent link');
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (!check.adult.roles.includes("parent")) {
    const { error: roleError } = await auth.admin
      .from("profiles")
      .update({ roles: [...new Set([...check.adult.roles, "parent"])] })
      .eq("id", check.adult.id);

    if (roleError) {
      logger.error({ route, userId: auth.userId, riderId, adultId: payload.adult_id, err: roleError }, 'Failed to assign parent role');
      return NextResponse.json({ error: roleError.message }, { status: 500 });
    }
  }

  logger.info({ route, userId: auth.userId, riderId, adultId: payload.adult_id }, 'Parent linked to rider');
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: riderId } = await params;
  const route = 'PATCH /api/admin/riders/[id]/parents';
  const auth = await requireAdmin(route);
  if ("error" in auth) return auth.error;

  let payload: z.infer<typeof updateLinkSchema>;
  try {
    payload = updateLinkSchema.parse(await request.json());
  } catch {
    logger.warn({ route, userId: auth.userId, riderId }, 'Invalid request payload');
    return NextResponse.json(
      { error: "adult_id, relationship, and is_primary are required" },
      { status: 400 },
    );
  }

  const { data: existingLink } = await auth.admin
    .from("rider_parents")
    .select("rider_id, is_primary")
    .eq("rider_id", riderId)
    .eq("parent_id", payload.adult_id)
    .maybeSingle();

  if (!existingLink) {
    logger.warn({ route, userId: auth.userId, riderId, adultId: payload.adult_id }, 'Link not found');
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  if (payload.is_primary) {
    const { error: clearPrimaryError } = await auth.admin
      .from("rider_parents")
      .update({ is_primary: false })
      .eq("rider_id", riderId)
      .neq("parent_id", payload.adult_id);

    if (clearPrimaryError) {
      logger.error({ route, userId: auth.userId, riderId, err: clearPrimaryError }, 'Failed to clear existing primary parent');
      return NextResponse.json(
        { error: clearPrimaryError.message },
        { status: 500 },
      );
    }
  } else if (existingLink.is_primary) {
    const { data: otherPrimary, error: otherPrimaryError } = await auth.admin
      .from("rider_parents")
      .select("parent_id")
      .eq("rider_id", riderId)
      .neq("parent_id", payload.adult_id)
      .eq("is_primary", true)
      .maybeSingle();

    if (otherPrimaryError) {
      logger.error({ route, userId: auth.userId, riderId, err: otherPrimaryError }, 'Failed to check for other primary parent');
      return NextResponse.json(
        { error: otherPrimaryError.message },
        { status: 500 },
      );
    }

    if (!otherPrimary) {
      logger.warn({ route, userId: auth.userId, riderId, adultId: payload.adult_id }, 'Cannot unset the only primary contact');
      return NextResponse.json(
        {
          error:
            "Cannot unset the only primary contact. Mark another adult as primary first.",
        },
        { status: 400 },
      );
    }
  }

  const { error: updateError } = await auth.admin
    .from("rider_parents")
    .update({
      relationship: payload.relationship,
      is_primary: payload.is_primary,
    })
    .eq("rider_id", riderId)
    .eq("parent_id", payload.adult_id);

  if (updateError) {
    logger.error({ route, userId: auth.userId, riderId, adultId: payload.adult_id, err: updateError }, 'Failed to update parent link');
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  logger.info({ route, userId: auth.userId, riderId, adultId: payload.adult_id }, 'Parent link updated');
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: riderId } = await params;
  const route = 'DELETE /api/admin/riders/[id]/parents';
  const auth = await requireAdmin(route);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const adultId = searchParams.get("adult_id");
  const parsedAdultId = looseUuid.safeParse(adultId);

  if (!parsedAdultId.success) {
    logger.warn({ route, userId: auth.userId, riderId }, 'Missing or invalid adult_id');
    return NextResponse.json({ error: "adult_id is required" }, { status: 400 });
  }

  const { data: linkToDelete } = await auth.admin
    .from("rider_parents")
    .select("is_primary")
    .eq("rider_id", riderId)
    .eq("parent_id", parsedAdultId.data)
    .maybeSingle();

  if (!linkToDelete) {
    logger.warn({ route, userId: auth.userId, riderId, adultId: parsedAdultId.data }, 'Link not found');
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  const { error: deleteError } = await auth.admin
    .from("rider_parents")
    .delete()
    .eq("rider_id", riderId)
    .eq("parent_id", parsedAdultId.data);

  if (deleteError) {
    logger.error({ route, userId: auth.userId, riderId, adultId: parsedAdultId.data, err: deleteError }, 'Failed to delete parent link');
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (linkToDelete.is_primary) {
    const { data: remainingLinks, error: remainingError } = await auth.admin
      .from("rider_parents")
      .select("parent_id, is_primary")
      .eq("rider_id", riderId)
      .order("parent_id");

    if (remainingError) {
      logger.error({ route, userId: auth.userId, riderId, err: remainingError }, 'Failed to fetch remaining parent links after delete');
      return NextResponse.json({ error: remainingError.message }, { status: 500 });
    }

    const links = remainingLinks ?? [];
    if (links.length > 0 && !links.some((l) => l.is_primary)) {
      const { error: promoteError } = await auth.admin
        .from("rider_parents")
        .update({ is_primary: true })
        .eq("rider_id", riderId)
        .eq("parent_id", links[0].parent_id);

      if (promoteError) {
        logger.error({ route, userId: auth.userId, riderId, err: promoteError }, 'Failed to promote new primary parent after delete');
        return NextResponse.json({ error: promoteError.message }, { status: 500 });
      }
    }
  }

  logger.info({ route, userId: auth.userId, riderId, adultId: parsedAdultId.data }, 'Parent link deleted');
  return NextResponse.json({ success: true });
}
