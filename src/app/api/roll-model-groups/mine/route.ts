import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "GET /api/roll-model-groups/mine" }, "Unauthenticated");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("roll_model_groups")
    .select("group_id")
    .eq("roll_model_id", user.id);

  if (error) {
    logger.error({ route: "GET /api/roll-model-groups/mine", userId: user.id, err: error }, "Failed to fetch roll model groups");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const groupIds = (data ?? []).map((row) => row.group_id);
  return NextResponse.json(groupIds);
}
