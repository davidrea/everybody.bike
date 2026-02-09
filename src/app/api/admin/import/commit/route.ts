import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCsv } from "@/lib/csv-parser";
import type { CsvImportResult } from "@/types";

export async function POST(request: Request) {
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

  const body = await request.json();
  const { csv_text, import_type } = body;

  if (!csv_text || !import_type) {
    return NextResponse.json(
      { error: "csv_text and import_type are required" },
      { status: 400 },
    );
  }

  const { rows } = parseCsv(csv_text);
  const admin = createAdminClient();

  if (import_type === "riders") {
    return handleRiderCommit(supabase, admin, rows, user.id);
  } else if (import_type === "adults") {
    return handleAdultCommit(supabase, admin, rows, user.id);
  }

  return NextResponse.json(
    { error: 'import_type must be "riders" or "adults"' },
    { status: 400 },
  );
}

async function handleRiderCommit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: ReturnType<typeof createAdminClient>,
  rows: Record<string, string>[],
  invitedBy: string,
) {
  const result: CsvImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    invites_sent: 0,
  };

  // Load groups and existing riders
  const { data: groups } = await supabase.from("groups").select("id, name");
  const groupMap = new Map(
    (groups ?? []).map((g) => [g.name.toLowerCase(), g.id]),
  );

  const { data: existingRiders } = await supabase
    .from("riders")
    .select("id, first_name, last_name, date_of_birth");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    try {
      const firstName = row.first_name?.trim();
      const lastName = row.last_name?.trim();
      const dob = row.date_of_birth?.trim() || null;
      const groupName = row.group_name?.trim();
      const parentEmails = (row.parent_emails ?? "")
        .split(/[;,]/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (!firstName || !lastName || !groupName) {
        result.errors.push({ row: rowNum, message: "Missing required fields" });
        result.skipped++;
        continue;
      }

      const groupId = groupMap.get(groupName.toLowerCase());
      if (!groupId) {
        result.errors.push({
          row: rowNum,
          message: `Unknown group: ${groupName}`,
        });
        result.skipped++;
        continue;
      }

      // Check for existing rider (dedup by name + DOB)
      const existing = (existingRiders ?? []).find(
        (r) =>
          r.first_name.toLowerCase() === firstName.toLowerCase() &&
          r.last_name.toLowerCase() === lastName.toLowerCase() &&
          r.date_of_birth === dob,
      );

      let riderId: string;

      if (existing) {
        // Update existing rider
        await supabase
          .from("riders")
          .update({ group_id: groupId })
          .eq("id", existing.id);
        riderId = existing.id;
        result.updated++;
      } else {
        // Create new rider
        const { data: newRider, error } = await supabase
          .from("riders")
          .insert({
            first_name: firstName,
            last_name: lastName,
            date_of_birth: dob,
            group_id: groupId,
          })
          .select("id")
          .single();

        if (error || !newRider) {
          result.errors.push({ row: rowNum, message: error?.message ?? "Insert failed" });
          result.skipped++;
          continue;
        }
        riderId = newRider.id;
        result.created++;
      }

      // Link parents
      for (const email of parentEmails) {
        // Find or create parent profile
        const { data: parentProfile } = await supabase
          .from("profiles")
          .select("id, roles")
          .ilike("email", email)
          .maybeSingle();

        let parentId: string;

        if (parentProfile) {
          parentId = parentProfile.id;
          // Ensure parent role
          if (!parentProfile.roles.includes("parent")) {
            await admin
              .from("profiles")
              .update({ roles: [...parentProfile.roles, "parent"] })
              .eq("id", parentId);
          }
        } else {
          // Create new user + send invite
          const { data: authData, error: authError } =
            await admin.auth.admin.createUser({
              email,
              email_confirm: false,
              user_metadata: { full_name: email.split("@")[0] },
            });

          if (authError || !authData.user) {
            result.errors.push({
              row: rowNum,
              message: `Failed to create parent ${email}: ${authError?.message}`,
            });
            continue;
          }

          parentId = authData.user.id;

          await admin
            .from("profiles")
            .update({
              roles: ["parent"],
              invite_status: "pending",
              invited_at: new Date().toISOString(),
              invited_by: invitedBy,
            })
            .eq("id", parentId);

          // Send invite
          await admin.auth.admin.inviteUserByEmail(email);
          result.invites_sent++;
        }

        // Link rider to parent (ignore if already exists)
        await supabase
          .from("rider_parents")
          .upsert(
            {
              rider_id: riderId,
              parent_id: parentId,
              relationship: "parent",
              is_primary: parentEmails.indexOf(email) === 0,
            },
            { onConflict: "rider_id,parent_id" },
          );
      }
    } catch (err) {
      result.errors.push({
        row: rowNum,
        message: err instanceof Error ? err.message : "Unexpected error",
      });
      result.skipped++;
    }
  }

  return NextResponse.json(result);
}

async function handleAdultCommit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: ReturnType<typeof createAdminClient>,
  rows: Record<string, string>[],
  invitedBy: string,
) {
  const result: CsvImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    invites_sent: 0,
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    try {
      const fullName = row.full_name?.trim();
      const email = row.email?.trim().toLowerCase();
      const roles = (row.roles ?? "")
        .split(/[;,]/)
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);

      if (!fullName || !email || roles.length === 0) {
        result.errors.push({ row: rowNum, message: "Missing required fields" });
        result.skipped++;
        continue;
      }

      // Check existing
      const { data: existing } = await supabase
        .from("profiles")
        .select("id, roles")
        .ilike("email", email)
        .maybeSingle();

      if (existing) {
        // Merge roles
        const mergedRoles = Array.from(
          new Set([...existing.roles, ...roles]),
        );
        await admin
          .from("profiles")
          .update({ roles: mergedRoles, full_name: fullName })
          .eq("id", existing.id);
        result.updated++;
      } else {
        // Create new user
        const { data: authData, error: authError } =
          await admin.auth.admin.createUser({
            email,
            email_confirm: false,
            user_metadata: { full_name: fullName },
          });

        if (authError || !authData.user) {
          result.errors.push({
            row: rowNum,
            message: `Failed to create user: ${authError?.message}`,
          });
          result.skipped++;
          continue;
        }

        await admin
          .from("profiles")
          .update({
            full_name: fullName,
            roles,
            invite_status: "pending",
            invited_at: new Date().toISOString(),
            invited_by: invitedBy,
          })
          .eq("id", authData.user.id);

        await admin.auth.admin.inviteUserByEmail(email);
        result.invites_sent++;
        result.created++;
      }
    } catch (err) {
      result.errors.push({
        row: rowNum,
        message: err instanceof Error ? err.message : "Unexpected error",
      });
      result.skipped++;
    }
  }

  return NextResponse.json(result);
}
