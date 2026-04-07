import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: 'GET /api/admin/users' }, 'Unauthenticated');
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
    logger.warn({ route: 'GET /api/admin/users', userId: user.id }, 'Forbidden: not admin');
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role");
  const inviteStatus = searchParams.get("invite_status");

  let query = supabase
    .from("profiles")
    .select("*, push_subscriptions(id)")
    .order("full_name");

  if (role) {
    query = query.contains("roles", [role]);
  }
  if (inviteStatus) {
    query = query.eq("invite_status", inviteStatus);
  }

  const { data, error } = await query;

  if (error) {
    logger.error({ route: 'GET /api/admin/users', userId: user.id, err: error }, 'Failed to fetch users');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched =
    data?.map((row) => ({
      ...row,
      push_enabled: (row.push_subscriptions?.length ?? 0) > 0,
      push_count: row.push_subscriptions?.length ?? 0,
      push_subscriptions: undefined,
    })) ?? [];

  return NextResponse.json(enriched);
}
