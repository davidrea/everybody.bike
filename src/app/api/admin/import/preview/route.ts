import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv-parser";
import { csvRiderRowSchema, csvAdultRowSchema } from "@/lib/validators";
import type { CsvPreviewRow } from "@/types";

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

  const { headers, rows } = parseCsv(csv_text);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "CSV has no data rows" },
      { status: 400 },
    );
  }

  if (import_type === "riders") {
    return handleRiderPreview(supabase, headers, rows);
  } else if (import_type === "adults") {
    return handleAdultPreview(supabase, headers, rows);
  }

  return NextResponse.json(
    { error: 'import_type must be "riders" or "adults"' },
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
