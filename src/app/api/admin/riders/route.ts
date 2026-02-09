import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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

  const { data, error } = await supabase
    .from("riders")
    .select(
      "id, first_name, last_name, date_of_birth, group_id, groups(id, name, color), rider_parents(parent_id, relationship, is_primary, profiles:parent_id(id, full_name, email, medical_alerts, media_opt_out))",
    )
    .order("last_name")
    .order("first_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type GroupRow = { id: string; name: string; color: string } | null;
  type ParentRow = {
    parent_id: string;
    relationship: "parent" | "guardian" | "emergency_contact";
    is_primary: boolean;
    profiles: {
      id: string;
      full_name: string;
      email: string | null;
      medical_alerts: string | null;
      media_opt_out: boolean;
    };
  };

  const riders = (data ?? []).map((r) => {
    const group = r.groups as unknown as GroupRow;
    const parents = (r.rider_parents as unknown as ParentRow[]).slice();
    parents.sort((a, b) => {
      if (a.is_primary === b.is_primary) {
        return a.profiles.full_name.localeCompare(b.profiles.full_name);
      }
      return a.is_primary ? -1 : 1;
    });

    return {
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      date_of_birth: r.date_of_birth,
      group_id: r.group_id,
      group_name: group?.name ?? null,
      group_color: group?.color ?? null,
      parents: parents.map((rp) => ({
        id: rp.profiles.id,
        full_name: rp.profiles.full_name,
        email: rp.profiles.email,
        medical_alerts: rp.profiles.medical_alerts,
        media_opt_out: rp.profiles.media_opt_out,
        relationship: rp.relationship,
        is_primary: rp.is_primary,
      })),
    };
  });

  return NextResponse.json(riders);
}
