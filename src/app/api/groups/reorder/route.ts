import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { logger } from "@/lib/logger";

const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "PUT /api/groups/reorder" }, "Unauthenticated");
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
    logger.warn({ route: "PUT /api/groups/reorder", userId: user.id }, "Forbidden");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = reorderSchema.safeParse(body);

  if (!parsed.success) {
    logger.warn({ route: "PUT /api/groups/reorder", userId: user.id }, "Validation failed");
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates = parsed.data.orderedIds.map((id, index) =>
    supabase.from("groups").update({ sort_order: index }).eq("id", id),
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);

  if (failed?.error) {
    logger.error({ route: "PUT /api/groups/reorder", userId: user.id, err: failed.error }, "Failed to reorder groups");
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  logger.info({ route: "PUT /api/groups/reorder", userId: user.id }, "Groups reordered");
  return NextResponse.json({ success: true });
}
