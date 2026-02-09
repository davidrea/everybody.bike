import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().optional(),
  medical_alerts: z.string().max(2000).optional().or(z.literal("")),
  media_opt_out: z.boolean().optional(),
}).refine(
  (data) =>
    data.full_name !== undefined ||
    data.email !== undefined ||
    data.medical_alerts !== undefined ||
    data.media_opt_out !== undefined,
  {
  message: "At least one field is required",
  },
);

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

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  const updates: {
    full_name?: string;
    email?: string;
    medical_alerts?: string | null;
    media_opt_out?: boolean;
  } = {};
  if (parsed.data.full_name) {
    updates.full_name = parsed.data.full_name;
  }

  if (parsed.data.email) {
    const normalizedEmail = parsed.data.email.toLowerCase();
    if (normalizedEmail !== (currentProfile?.email ?? "").toLowerCase()) {
      const { data: existingEmailProfile } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", normalizedEmail)
        .neq("id", user.id)
        .maybeSingle();

      if (existingEmailProfile) {
        return NextResponse.json(
          { error: "A user with this email address already exists" },
          { status: 409 },
        );
      }

      const { error: emailError } = await supabase.auth.updateUser({
        email: normalizedEmail,
      });
      if (emailError) {
        return NextResponse.json({ error: emailError.message }, { status: 500 });
      }
      updates.email = normalizedEmail;
    }
  }

  if (parsed.data.medical_alerts !== undefined) {
    const trimmed = parsed.data.medical_alerts.trim();
    updates.medical_alerts = trimmed.length > 0 ? trimmed : null;
  }

  if (parsed.data.media_opt_out !== undefined) {
    updates.media_opt_out = parsed.data.media_opt_out;
  }

  if (
    updates.full_name !== undefined ||
    updates.email !== undefined ||
    updates.medical_alerts !== undefined ||
    updates.media_opt_out !== undefined
  ) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
  }

  if (updates.full_name) {
    // Keep auth metadata aligned for email templates / external displays.
    await supabase.auth.updateUser({
      data: { full_name: updates.full_name },
    });
  }

  return NextResponse.json({ success: true });
}
