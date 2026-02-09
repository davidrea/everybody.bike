import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
});

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name })
    .eq("id", user.id);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Keep auth metadata aligned for email templates / external displays.
  await supabase.auth.updateUser({
    data: { full_name: parsed.data.full_name },
  });

  return NextResponse.json({ success: true });
}
