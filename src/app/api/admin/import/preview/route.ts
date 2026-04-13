import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv-parser";
import { csvRiderRowSchema, csvAdultRowSchema, rootzMasterRowSchema } from "@/lib/validators";
import type { CsvPreviewRow, RootzPreviewRow } from "@/types";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: 'POST /api/admin/import/preview' }, 'Unauthenticated');
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
    logger.warn({ route: 'POST /api/admin/import/preview', userId: user.id }, 'Forbidden: not admin');
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { csv_text, import_type } = body;

  if (!csv_text || !import_type) {
    logger.warn({ route: 'POST /api/admin/import/preview', userId: user.id }, 'Missing csv_text or import_type');
    return NextResponse.json(
      { error: "csv_text and import_type are required" },
      { status: 400 },
    );
  }

  const { headers, rows } = parseCsv(csv_text);

  if (rows.length === 0) {
    logger.warn({ route: 'POST /api/admin/import/preview', userId: user.id }, 'CSV has no data rows');
    return NextResponse.json(
      { error: "CSV has no data rows" },
      { status: 400 },
    );
  }

  if (import_type === "riders") {
    return handleRiderPreview(supabase, headers, rows);
  } else if (import_type === "adults") {
    return handleAdultPreview(supabase, headers, rows);
  } else if (import_type === "rootz_master") {
    return handleRootzMasterPreview(supabase, rows);
  }

  logger.warn({ route: 'POST /api/admin/import/preview', userId: user.id, import_type }, 'Invalid import_type');
  return NextResponse.json(
    { error: 'import_type must be "riders", "adults", or "rootz_master"' },
    { status: 400 },
  );
}

async function handleRiderPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  _headers: string[],
  rows: Record<string, string>[],
) {
  // Fetch existing groups for matching
  const { data: groups } = await supabase
    .from("groups")
    .select("id, name");
  const groupMap = new Map(
    (groups ?? []).map((g) => [g.name.toLowerCase(), g.id]),
  );

  // Fetch existing riders for dedup
  const { data: existingRiders } = await supabase
    .from("riders")
    .select("id, first_name, last_name, date_of_birth");

  const preview: CsvPreviewRow[] = rows.map((row, index) => {
    const errors: string[] = [];
    const parsed = csvRiderRowSchema.safeParse(row);

    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message);
      return {
        row_number: index + 2,
        data: row,
        action: "skip" as const,
        errors: issues,
      };
    }

    const d = parsed.data;

    // Check group exists
    if (!groupMap.has(d.group_name.toLowerCase())) {
      errors.push(`Unknown group: ${d.group_name}`);
    }

    // Check for duplicate rider
    const isDuplicate = (existingRiders ?? []).some(
      (r) =>
        r.first_name.toLowerCase() === d.first_name.toLowerCase() &&
        r.last_name.toLowerCase() === d.last_name.toLowerCase() &&
        r.date_of_birth === (d.date_of_birth || null),
    );

    // Validate parent emails
    const emails = d.parent_emails
      .split(/[;,]/)
      .map((e) => e.trim())
      .filter(Boolean);

    if (emails.length === 0) {
      errors.push("No valid parent emails");
    }

    for (const email of emails) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push(`Invalid email: ${email}`);
      }
    }

    // Validate parent names match emails count (if provided)
    const parentNames = (d.parent_names ?? "")
      .split(/[;,]/)
      .map((n) => n.trim())
      .filter(Boolean);

    if (parentNames.length > 0 && parentNames.length !== emails.length) {
      errors.push(
        `parent_names count (${parentNames.length}) doesn't match parent_emails count (${emails.length})`
      );
    }

    return {
      row_number: index + 2,
      data: row,
      action: errors.length > 0 ? "skip" : isDuplicate ? "update" : "create",
      errors,
    };
  });

  return NextResponse.json({ preview, import_type: "riders" });
}

async function handleAdultPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  _headers: string[],
  rows: Record<string, string>[],
) {
  const { data: existingProfiles } = await supabase
    .from("profiles")
    .select("id, email, roles");

  const emailMap = new Map(
    (existingProfiles ?? []).map((p) => [p.email.toLowerCase(), p]),
  );

  const validRoles = ["admin", "roll_model", "parent", "rider"];

  const preview: CsvPreviewRow[] = rows.map((row, index) => {
    const errors: string[] = [];
    const parsed = csvAdultRowSchema.safeParse(row);

    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message);
      return {
        row_number: index + 2,
        data: row,
        action: "skip" as const,
        errors: issues,
      };
    }

    const d = parsed.data;

    // Validate roles
    const roles = d.roles
      .split(/[;,]/)
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);

    for (const role of roles) {
      if (!validRoles.includes(role)) {
        errors.push(`Invalid role: ${role}`);
      }
    }

    const existing = emailMap.get(d.email.toLowerCase());

    return {
      row_number: index + 2,
      data: row,
      action:
        errors.length > 0 ? "skip" : existing ? "update" : "create",
      errors,
    };
  });

  return NextResponse.json({ preview, import_type: "adults" });
}

// ─── ROOTZ Master Preview ─────────────────────────────────────

function classifyRootzRow(row: Record<string, string>): "adult_rider" | "minor_rider" | "unknown" {
  const category = (row.category_entered ?? "").toLowerCase();
  if (category.includes("adult rider")) return "adult_rider";
  if (category.includes("youth rider") || category.includes("18 and under")) return "minor_rider";

  // Fallback: check age if category is ambiguous
  const age = parseInt(row.age_on_event_day ?? "", 10);
  if (!isNaN(age)) {
    return age >= 18 ? "adult_rider" : "minor_rider";
  }

  return "unknown";
}

function inferParentName(
  row: Record<string, string>,
  email: string,
): { name: string; guessed: boolean } {
  const emergencyContact = (row.emergency_contact ?? "").trim();
  const lastName = (row.last_name ?? "").trim();

  // If emergency contact has a real name (at least 2 chars, not just initials)
  if (emergencyContact.length > 2 && /[a-z]/i.test(emergencyContact)) {
    return { name: emergencyContact, guessed: true };
  }

  // Fall back to email local part, titlecased
  const localPart = email.split("@")[0]
    .replace(/[._0-9]+/g, " ")
    .trim();

  if (localPart.length > 2) {
    const titleCased = localPart
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    return { name: titleCased, guessed: true };
  }

  return { name: `${lastName} Parent`, guessed: true };
}

function parseMediaOptOut(mediaValue: string): boolean {
  // "Yes" means they consent to media → opt-out = false
  // "No" means they do NOT consent → opt-out = true
  const lower = mediaValue.toLowerCase().trim();
  return lower === "no" || lower.startsWith("no ");
}

function hasMedicalInfo(row: Record<string, string>): boolean {
  const medsYesNo = (row.meds_yes_no ?? "").toLowerCase();
  const medical = (row.medical ?? "").trim().toLowerCase();
  return (
    medsYesNo.includes("yes") ||
    (medical !== "" && medical !== "none" && medical !== "n/a" && medical !== "na")
  );
}

async function handleRootzMasterPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Record<string, string>[],
) {
  // Fetch existing profiles for dedup
  const { data: existingProfiles } = await supabase
    .from("profiles")
    .select("id, email, roles, full_name");
  const profilesByEmail = new Map(
    (existingProfiles ?? []).map((p) => [p.email.toLowerCase(), p]),
  );

  // Fetch existing riders for dedup
  const { data: existingRiders } = await supabase
    .from("riders")
    .select("id, first_name, last_name, date_of_birth");

  // Build a set of adult rider emails from the CSV itself (for parent resolution)
  const adultEmailsInCsv = new Set<string>();
  for (const row of rows) {
    if (classifyRootzRow(row) === "adult_rider") {
      const email = (row.email ?? "").trim().toLowerCase();
      if (email) adultEmailsInCsv.add(email);
    }
  }

  const preview: RootzPreviewRow[] = rows.map((row, index) => {
    const classification = classifyRootzRow(row);

    // Validate required fields
    const parsed = rootzMasterRowSchema.safeParse(row);
    if (!parsed.success) {
      return {
        row_number: index + 2,
        data: row,
        classification,
        action: "skip" as const,
        errors: parsed.error.issues.map((i) => i.message),
        warnings: [],
      };
    }

    const d = parsed.data;
    const email = d.email.trim().toLowerCase();
    const errors: string[] = [];
    const warnings: string[] = [];

    if (classification === "unknown") {
      errors.push(`Cannot classify row: category "${d.category_entered}" is not recognized`);
      return {
        row_number: index + 2,
        data: row,
        classification,
        action: "skip" as const,
        errors,
        warnings,
      };
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Invalid email: ${email}`);
    }

    const mediaOptOut = parseMediaOptOut(d.media);
    const hasMedical = hasMedicalInfo(row);

    if (classification === "adult_rider") {
      // Adult rider: check if profile already exists
      const existing = profilesByEmail.get(email);
      const action = errors.length > 0 ? "skip" : existing ? "update" : "create";

      return {
        row_number: index + 2,
        data: row,
        classification,
        action: action as "create" | "update" | "skip",
        errors,
        warnings,
        riders_level: d.riders_level || undefined,
        has_medical: hasMedical,
        media_opt_out: mediaOptOut,
      };
    }

    // Minor rider
    const fullName = `${d.first_name} ${d.last_name}`;

    // Parse DOB for dedup (handle M/D/YYYY format)
    let isoDate: string | null = null;
    if (d.date_of_birth) {
      const parts = d.date_of_birth.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (parts) {
        const month = parts[1].padStart(2, "0");
        const day = parts[2].padStart(2, "0");
        isoDate = `${parts[3]}-${month}-${day}`;
      } else {
        warnings.push(`Unusual date format: ${d.date_of_birth}`);
      }
    }

    // Check for existing minor rider
    const existingRider = (existingRiders ?? []).find(
      (r) =>
        r.first_name.toLowerCase() === d.first_name.toLowerCase() &&
        r.last_name.toLowerCase() === d.last_name.toLowerCase() &&
        r.date_of_birth === isoDate,
    );

    // Resolve parent
    let parentResolution: RootzPreviewRow["parent_resolution"];
    let inferredParentName: string | undefined;
    let parentNameGuessed = false;

    const existingProfile = profilesByEmail.get(email);
    if (existingProfile) {
      parentResolution = "existing_profile";
      inferredParentName = existingProfile.full_name;
    } else if (adultEmailsInCsv.has(email)) {
      parentResolution = "adult_in_csv";
      // Find the adult row to get their name
      const adultRow = rows.find(
        (r) =>
          classifyRootzRow(r) === "adult_rider" &&
          (r.email ?? "").trim().toLowerCase() === email,
      );
      if (adultRow) {
        inferredParentName = `${adultRow.first_name ?? ""} ${adultRow.last_name ?? ""}`.trim();
      }
    } else {
      parentResolution = "new_invite";
      const inferred = inferParentName(row, email);
      inferredParentName = inferred.name;
      parentNameGuessed = inferred.guessed;
      if (parentNameGuessed) {
        warnings.push(`Parent name guessed as "${inferredParentName}" — verify before import`);
      }
    }

    const action = errors.length > 0 ? "skip" : existingRider ? "update" : "create";

    return {
      row_number: index + 2,
      data: row,
      classification,
      action: action as "create" | "update" | "skip",
      errors,
      warnings,
      parent_resolution: parentResolution,
      inferred_parent_name: inferredParentName,
      parent_name_guessed: parentNameGuessed,
      riders_level: d.riders_level || undefined,
      has_medical: hasMedical,
      media_opt_out: mediaOptOut,
    };
  });

  return NextResponse.json({ preview, import_type: "rootz_master" });
}
