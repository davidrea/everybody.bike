import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCsv } from "@/lib/csv-parser";
import type { CsvImportResult, RootzImportResult } from "@/types";
import { logger } from "@/lib/logger";

// Roles that may be assigned via CSV import.
// super_admin is intentionally excluded — it can only be granted via the
// dedicated role-management UI by an existing super_admin.
const IMPORTABLE_ROLES = new Set(["admin", "roll_model", "parent", "rider"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: 'POST /api/admin/import/commit' }, 'Unauthenticated');
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
    logger.warn({ route: 'POST /api/admin/import/commit', userId: user.id }, 'Forbidden: not admin');
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { csv_text, import_type } = body;

  if (!csv_text || !import_type) {
    logger.warn({ route: 'POST /api/admin/import/commit', userId: user.id }, 'Missing csv_text or import_type');
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
  } else if (import_type === "rootz_master") {
    const parentNameOverrides: Record<string, string> = body.parent_name_overrides ?? {};
    return handleRootzMasterCommit(supabase, admin, rows, user.id, parentNameOverrides);
  }

  logger.warn({ route: 'POST /api/admin/import/commit', userId: user.id, import_type }, 'Invalid import_type');
  return NextResponse.json(
    { error: 'import_type must be "riders", "adults", or "rootz_master"' },
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

      const parentNames = (row.parent_names ?? "")
        .split(/[;,]/)
        .map((n) => n.trim())
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
          logger.error({ route: 'POST /api/admin/import/commit', userId: invitedBy, err: error, rowNum }, 'Failed to insert rider');
          result.errors.push({ row: rowNum, message: error?.message ?? "Insert failed" });
          result.skipped++;
          continue;
        }
        riderId = newRider.id;
        result.created++;
      }

      // Link parents
      for (let pi = 0; pi < parentEmails.length; pi++) {
        const email = parentEmails[pi];
        // Use matched name from parent_names column, fall back to email username
        const fullName = parentNames[pi] || email.split("@")[0];

        // Find or create parent profile
        const { data: parentProfile } = await supabase
          .from("profiles")
          .select("id, roles")
          .ilike("email", email)
          .maybeSingle();

        let parentId: string;

        if (parentProfile) {
          parentId = parentProfile.id;
          // Ensure parent role, update name if provided
          const updates: Record<string, unknown> = {};
          if (!parentProfile.roles.includes("parent")) {
            updates.roles = [...parentProfile.roles, "parent"];
          }
          if (parentNames[pi]) {
            updates.full_name = fullName;
          }
          if (Object.keys(updates).length > 0) {
            await admin
              .from("profiles")
              .update(updates)
              .eq("id", parentId);
          }
        } else {
          // Create new user + send invite
          const { data: authData, error: authError } =
            await admin.auth.admin.createUser({
              email,
              email_confirm: false,
              user_metadata: { full_name: fullName },
            });

          if (authError || !authData.user) {
            logger.error({ route: 'POST /api/admin/import/commit', userId: invitedBy, err: authError, rowNum, email }, 'Failed to create parent user');
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
              full_name: fullName,
              roles: ["parent"],
              invite_status: "pending",
              invited_at: new Date().toISOString(),
              invited_by: invitedBy,
            })
            .eq("id", parentId);

          // Send invite
          await admin.auth.admin.inviteUserByEmail(email);
          logger.info({ route: 'POST /api/admin/import/commit', userId: invitedBy, invitedUserId: parentId, email }, 'Parent invited via CSV import');
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
              is_primary: pi === 0,
            },
            { onConflict: "rider_id,parent_id" },
          );
      }
    } catch (err) {
      logger.error({ route: 'POST /api/admin/import/commit', userId: invitedBy, err, rowNum }, 'Unexpected error processing rider row');
      result.errors.push({
        row: rowNum,
        message: err instanceof Error ? err.message : "Unexpected error",
      });
      result.skipped++;
    }
  }

  logger.info({ route: 'POST /api/admin/import/commit', userId: invitedBy, created: result.created, updated: result.updated, skipped: result.skipped, invites_sent: result.invites_sent }, 'Rider CSV import complete');
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
      const rawRoles = (row.roles ?? "")
        .split(/[;,]/)
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);

      if (!fullName || !email || rawRoles.length === 0) {
        result.errors.push({ row: rowNum, message: "Missing required fields" });
        result.skipped++;
        continue;
      }

      // Validate all roles against allowlist (prevents super_admin injection)
      const invalidRoles = rawRoles.filter((r) => !IMPORTABLE_ROLES.has(r));
      if (invalidRoles.length > 0) {
        result.errors.push({
          row: rowNum,
          message: `Invalid role(s): ${invalidRoles.join(", ")}. Allowed: ${[...IMPORTABLE_ROLES].join(", ")}`,
        });
        result.skipped++;
        continue;
      }
      const roles = rawRoles;

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
          logger.error({ route: 'POST /api/admin/import/commit', userId: invitedBy, err: authError, rowNum, email }, 'Failed to create adult user');
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
        logger.info({ route: 'POST /api/admin/import/commit', userId: invitedBy, invitedUserId: authData.user.id, email }, 'Adult invited via CSV import');
        result.invites_sent++;
        result.created++;
      }
    } catch (err) {
      logger.error({ route: 'POST /api/admin/import/commit', userId: invitedBy, err, rowNum }, 'Unexpected error processing adult row');
      result.errors.push({
        row: rowNum,
        message: err instanceof Error ? err.message : "Unexpected error",
      });
      result.skipped++;
    }
  }

  logger.info({ route: 'POST /api/admin/import/commit', userId: invitedBy, created: result.created, updated: result.updated, skipped: result.skipped, invites_sent: result.invites_sent }, 'Adult CSV import complete');
  return NextResponse.json(result);
}

// ─── ROOTZ Master Commit ──────────────────────────────────────

function classifyRootzRow(row: Record<string, string>): "adult_rider" | "minor_rider" | "unknown" {
  const category = (row.category_entered ?? "").toLowerCase();
  if (category.includes("adult rider")) return "adult_rider";
  if (category.includes("youth rider") || category.includes("18 and under")) return "minor_rider";
  const age = parseInt(row.age_on_event_day ?? "", 10);
  if (!isNaN(age)) return age >= 18 ? "adult_rider" : "minor_rider";
  return "unknown";
}

function parseDateOfBirth(dob: string): string | null {
  const parts = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!parts) return null;
  const month = parts[1].padStart(2, "0");
  const day = parts[2].padStart(2, "0");
  return `${parts[3]}-${month}-${day}`;
}

function parseMediaOptOut(mediaValue: string): boolean {
  const lower = mediaValue.toLowerCase().trim();
  return lower === "no" || lower.startsWith("no ");
}

function extractMedicalNotes(row: Record<string, string>): string | null {
  const medsYesNo = (row.meds_yes_no ?? "").toLowerCase();
  const medical = (row.medical ?? "").trim();
  if (medsYesNo.includes("yes") || (medical !== "" && medical.toLowerCase() !== "none" && medical.toLowerCase() !== "n/a" && medical.toLowerCase() !== "na")) {
    return medical || null;
  }
  return null;
}

function inferParentName(
  row: Record<string, string>,
  email: string,
): string {
  const emergencyContact = (row.emergency_contact ?? "").trim();
  const lastName = (row.last_name ?? "").trim();

  if (emergencyContact.length > 2 && /[a-z]/i.test(emergencyContact)) {
    return emergencyContact;
  }

  const localPart = email.split("@")[0].replace(/[._0-9]+/g, " ").trim();
  if (localPart.length > 2) {
    return localPart
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  return `${lastName} Parent`;
}

async function handleRootzMasterCommit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: ReturnType<typeof createAdminClient>,
  rows: Record<string, string>[],
  invitedBy: string,
  parentNameOverrides: Record<string, string>,
) {
  const result: RootzImportResult = {
    adult_riders_created: 0,
    adult_riders_updated: 0,
    minor_riders_created: 0,
    minor_riders_updated: 0,
    parents_created: 0,
    skipped: 0,
    errors: [],
    invites_sent: 0,
  };

  // Load existing profiles
  const { data: existingProfiles } = await supabase
    .from("profiles")
    .select("id, email, roles, full_name");
  const profilesByEmail = new Map(
    (existingProfiles ?? []).map((p) => [p.email.toLowerCase(), p]),
  );

  // Load existing riders for dedup
  const { data: existingRiders } = await supabase
    .from("riders")
    .select("id, first_name, last_name, date_of_birth");

  // Partition rows: process adult riders first, then minors
  const adultRows: { row: Record<string, string>; index: number }[] = [];
  const minorRows: { row: Record<string, string>; index: number }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const classification = classifyRootzRow(rows[i]);
    if (classification === "adult_rider") {
      adultRows.push({ row: rows[i], index: i });
    } else if (classification === "minor_rider") {
      minorRows.push({ row: rows[i], index: i });
    } else {
      result.errors.push({ row: i + 2, message: `Cannot classify row by category: "${rows[i].category_entered ?? ""}"` });
      result.skipped++;
    }
  }

  // ── Pass 1: Adult riders ──────────────────────────────────────

  for (const { row, index } of adultRows) {
    const rowNum = index + 2;
    try {
      const firstName = (row.first_name ?? "").trim();
      const lastName = (row.last_name ?? "").trim();
      const email = (row.email ?? "").trim().toLowerCase();
      const fullName = `${firstName} ${lastName}`;

      if (!firstName || !lastName || !email) {
        result.errors.push({ row: rowNum, message: "Missing required fields" });
        result.skipped++;
        continue;
      }

      const medicalNotes = extractMedicalNotes(row);
      const mediaOptOut = parseMediaOptOut(row.media ?? "");

      const existing = profilesByEmail.get(email);

      if (existing) {
        // Update: add rider role if not present, update medical/media
        const roles = existing.roles.includes("rider")
          ? existing.roles
          : [...existing.roles, "rider"];
        const updates: Record<string, unknown> = {
          roles,
          full_name: fullName,
          media_opt_out: mediaOptOut,
        };
        if (medicalNotes) {
          updates.medical_alerts = medicalNotes;
        }
        await admin.from("profiles").update(updates).eq("id", existing.id);
        // Update local cache so minor rows can find this profile
        profilesByEmail.set(email, { ...existing, roles, full_name: fullName });
        result.adult_riders_updated++;
      } else {
        // Create new user
        const { data: authData, error: authError } =
          await admin.auth.admin.createUser({
            email,
            email_confirm: false,
            user_metadata: { full_name: fullName },
          });

        if (authError || !authData.user) {
          logger.error({ route: 'POST /api/admin/import/commit', userId: invitedBy, err: authError, rowNum, email }, 'Failed to create adult rider');
          result.errors.push({ row: rowNum, message: `Failed to create user: ${authError?.message}` });
          result.skipped++;
          continue;
        }

        const profileUpdate: Record<string, unknown> = {
          full_name: fullName,
          roles: ["rider"],
          invite_status: "pending",
          invited_at: new Date().toISOString(),
          invited_by: invitedBy,
          media_opt_out: mediaOptOut,
        };
        if (medicalNotes) {
          profileUpdate.medical_alerts = medicalNotes;
        }

        await admin.from("profiles").update(profileUpdate).eq("id", authData.user.id);

        await admin.auth.admin.inviteUserByEmail(email);
        logger.info({ route: 'POST /api/admin/import/commit', userId: invitedBy, invitedUserId: authData.user.id, email }, 'Adult rider invited via ROOTZ import');
        result.invites_sent++;

        // Update local cache
        profilesByEmail.set(email, {
          id: authData.user.id,
          email,
          roles: ["rider"],
          full_name: fullName,
        });
        result.adult_riders_created++;
      }
    } catch (err) {
      logger.error({ route: 'POST /api/admin/import/commit', userId: invitedBy, err, rowNum }, 'Unexpected error processing adult rider row');
      result.errors.push({ row: rowNum, message: err instanceof Error ? err.message : "Unexpected error" });
      result.skipped++;
    }
  }

  // ── Pass 2: Minor riders ──────────────────────────────────────

  for (const { row, index } of minorRows) {
    const rowNum = index + 2;
    try {
      const firstName = (row.first_name ?? "").trim();
      const lastName = (row.last_name ?? "").trim();
      const email = (row.email ?? "").trim().toLowerCase();
      const dob = parseDateOfBirth((row.date_of_birth ?? "").trim());

      if (!firstName || !lastName || !email) {
        result.errors.push({ row: rowNum, message: "Missing required fields" });
        result.skipped++;
        continue;
      }

      const medicalNotes = extractMedicalNotes(row);
      const mediaOptOut = parseMediaOptOut(row.media ?? "");

      // Check for existing rider (dedup by name + DOB)
      const existingRider = (existingRiders ?? []).find(
        (r) =>
          r.first_name.toLowerCase() === firstName.toLowerCase() &&
          r.last_name.toLowerCase() === lastName.toLowerCase() &&
          r.date_of_birth === dob,
      );

      let riderId: string;

      if (existingRider) {
        // Update existing rider
        const riderUpdate: Record<string, unknown> = {
          media_opt_out: mediaOptOut,
        };
        if (medicalNotes) riderUpdate.medical_notes = medicalNotes;

        await supabase.from("riders").update(riderUpdate).eq("id", existingRider.id);
        riderId = existingRider.id;
        result.minor_riders_updated++;
      } else {
        // Create new rider (group_id left null — assigned later by admin)
        const riderInsert: Record<string, unknown> = {
          first_name: firstName,
          last_name: lastName,
          date_of_birth: dob,
          media_opt_out: mediaOptOut,
        };
        if (medicalNotes) riderInsert.medical_notes = medicalNotes;

        const { data: newRider, error } = await supabase
          .from("riders")
          .insert(riderInsert)
          .select("id")
          .single();

        if (error || !newRider) {
          logger.error({ route: 'POST /api/admin/import/commit', userId: invitedBy, err: error, rowNum }, 'Failed to insert minor rider');
          result.errors.push({ row: rowNum, message: error?.message ?? "Insert failed" });
          result.skipped++;
          continue;
        }
        riderId = newRider.id;
        result.minor_riders_created++;
      }

      // Resolve parent profile
      let parentProfile = profilesByEmail.get(email);

      if (!parentProfile) {
        // Determine parent name: check overrides first, then infer
        const parentName = parentNameOverrides[email] || inferParentName(row, email);

        const { data: authData, error: authError } =
          await admin.auth.admin.createUser({
            email,
            email_confirm: false,
            user_metadata: { full_name: parentName },
          });

        if (authError || !authData.user) {
          logger.error({ route: 'POST /api/admin/import/commit', userId: invitedBy, err: authError, rowNum, email }, 'Failed to create parent user');
          result.errors.push({ row: rowNum, message: `Failed to create parent ${email}: ${authError?.message}` });
          continue;
        }

        await admin.from("profiles").update({
          full_name: parentName,
          roles: ["parent"],
          invite_status: "pending",
          invited_at: new Date().toISOString(),
          invited_by: invitedBy,
        }).eq("id", authData.user.id);

        await admin.auth.admin.inviteUserByEmail(email);
        logger.info({ route: 'POST /api/admin/import/commit', userId: invitedBy, invitedUserId: authData.user.id, email }, 'Parent invited via ROOTZ import');
        result.invites_sent++;
        result.parents_created++;

        parentProfile = { id: authData.user.id, email, roles: ["parent"], full_name: parentName };
        profilesByEmail.set(email, parentProfile);
      } else {
        // Ensure parent role
        if (!parentProfile.roles.includes("parent")) {
          const updatedRoles = [...parentProfile.roles, "parent"];
          await admin.from("profiles").update({ roles: updatedRoles }).eq("id", parentProfile.id);
          parentProfile = { ...parentProfile, roles: updatedRoles };
          profilesByEmail.set(email, parentProfile);
        }
      }

      // Link rider to parent
      await supabase.from("rider_parents").upsert(
        {
          rider_id: riderId,
          parent_id: parentProfile.id,
          relationship: "parent",
          is_primary: true,
        },
        { onConflict: "rider_id,parent_id" },
      );
    } catch (err) {
      logger.error({ route: 'POST /api/admin/import/commit', userId: invitedBy, err, rowNum }, 'Unexpected error processing minor rider row');
      result.errors.push({ row: rowNum, message: err instanceof Error ? err.message : "Unexpected error" });
      result.skipped++;
    }
  }

  logger.info({
    route: 'POST /api/admin/import/commit',
    userId: invitedBy,
    adult_created: result.adult_riders_created,
    adult_updated: result.adult_riders_updated,
    minor_created: result.minor_riders_created,
    minor_updated: result.minor_riders_updated,
    parents_created: result.parents_created,
    invites_sent: result.invites_sent,
    skipped: result.skipped,
  }, 'ROOTZ master CSV import complete');

  return NextResponse.json(result);
}
