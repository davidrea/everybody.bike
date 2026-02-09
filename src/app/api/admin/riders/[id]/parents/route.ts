import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { admin: createAdminClient() };
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
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let payload: z.infer<typeof createLinkSchema>;
  try {
    payload = createLinkSchema.parse(await request.json());
  } catch {
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
    return NextResponse.json({ error: existingLinksError.message }, { status: 500 });
  }

  const riderLinks = existingLinks ?? [];
  const existingLink = riderLinks.find(
    (link) => link.parent_id === payload.adult_id,
  );

  if (existingLink) {
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
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (!check.adult.roles.includes("parent")) {
    const { error: roleError } = await auth.admin
      .from("profiles")
      .update({ roles: [...new Set([...check.adult.roles, "parent"])] })
      .eq("id", check.adult.id);

    if (roleError) {
      return NextResponse.json({ error: roleError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: riderId } = await params;
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let payload: z.infer<typeof updateLinkSchema>;
  try {
    payload = updateLinkSchema.parse(await request.json());
  } catch {
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
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  if (payload.is_primary) {
    const { error: clearPrimaryError } = await auth.admin
      .from("rider_parents")
      .update({ is_primary: false })
      .eq("rider_id", riderId)
      .neq("parent_id", payload.adult_id);

    if (clearPrimaryError) {
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
      return NextResponse.json(
        { error: otherPrimaryError.message },
        { status: 500 },
      );
    }

    if (!otherPrimary) {
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
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: riderId } = await params;
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const adultId = searchParams.get("adult_id");
  const parsedAdultId = looseUuid.safeParse(adultId);

  if (!parsedAdultId.success) {
    return NextResponse.json({ error: "adult_id is required" }, { status: 400 });
  }

  const { data: linkToDelete } = await auth.admin
    .from("rider_parents")
    .select("is_primary")
    .eq("rider_id", riderId)
    .eq("parent_id", parsedAdultId.data)
    .maybeSingle();

  if (!linkToDelete) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  const { error: deleteError } = await auth.admin
    .from("rider_parents")
    .delete()
    .eq("rider_id", riderId)
    .eq("parent_id", parsedAdultId.data);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (linkToDelete.is_primary) {
    const { data: remainingLinks, error: remainingError } = await auth.admin
      .from("rider_parents")
      .select("parent_id, is_primary")
      .eq("rider_id", riderId)
      .order("parent_id");

    if (remainingError) {
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
        return NextResponse.json({ error: promoteError.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ success: true });
}
