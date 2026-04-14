#!/usr/bin/env node
//
// everybody.bike club CLI — admin operations for user, rider, and group management.
//
// Usage (local dev):   node scripts/club-cli.js <command> <subcommand> [options]
// Usage (production):  docker compose exec app node scripts/club-cli.js <command> <subcommand> [options]
//
// Commands:
//   user find     --email <email>
//   user create   --email <email> --name <name> --roles <role,role>
//   user add-role --email <email> --role <role>
//   user invite   --email <email>
//   user list     [--role <role>]
//
//   rider create      --first <name> --last <name> --dob <YYYY-MM-DD> --parent-email <email>
//                     [--group <name>] [--medical <text>] [--media-opt-out]
//   rider find        --first <name> --last <name>
//   rider update      --id <uuid> [--group <name>] [--medical <text>] [--media-opt-out]
//   rider link-parent --id <uuid> --parent-email <email>
//                     [--relationship parent|guardian] [--primary]
//
//   group list
//   group create    --name <name> [--color <hex>]
//   group assign-rm --group <name> --email <email>
//
// Global flags:
//   --json    Output machine-readable JSON to stdout (all other output goes to stderr)
//   --env     Path to .env file (default: .env in cwd)
//

"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Env loading (for local dev; in Docker the vars are already set)
// ---------------------------------------------------------------------------

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function loadEnv(envFile) {
  if (envFile) {
    // Explicit --env flag: load only that file
    loadEnvFile(path.resolve(process.cwd(), envFile));
  } else {
    // Default: load .env then .env.local (matching Next.js convention).
    // .env.local is loaded second so its values take precedence.
    loadEnvFile(path.resolve(process.cwd(), ".env"));
    loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [], json: false, env: null };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--env" && argv[i + 1]) {
      args.env = argv[++i];
    } else if (arg.startsWith("--") && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[key] = argv[++i];
    } else if (arg.startsWith("--")) {
      // boolean flag
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[key] = true;
    } else {
      args._.push(arg);
    }
    i++;
  }
  return args;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

let JSON_MODE = false;

function log(...parts) {
  if (!JSON_MODE) console.log(...parts);
  else process.stderr.write(parts.join(" ") + "\n");
}

function err(...parts) {
  process.stderr.write(parts.join(" ") + "\n");
}

function succeed(data) {
  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: true, ...data }));
  } else {
    const action = data.action ? `[${data.action.toUpperCase()}]` : "[OK]";
    console.log(action, JSON.stringify(data, null, 2));
  }
}

function fail(message, code = 1) {
  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: false, error: message }));
  } else {
    err("ERROR:", message);
  }
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Supabase client (replicates src/lib/supabase/admin.ts)
// ---------------------------------------------------------------------------

function createSupabaseClient() {
  // @supabase/supabase-js is a production dependency — available in standalone
  const { createClient } = require("@supabase/supabase-js");

  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) fail("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!key) fail("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const IMPORTABLE_ROLES = new Set(["admin", "roll_model", "parent", "rider"]);
const ALL_ROLES = new Set(["super_admin", "admin", "roll_model", "parent", "rider"]);

async function findProfileByEmail(supabase, email) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, roles, invite_status, rider_group_id")
    .ilike("email", email.trim())
    .maybeSingle();
  if (error) fail(`DB error looking up email: ${error.message}`);
  return data;
}

async function resolveGroupByName(supabase, nameOrId) {
  if (!nameOrId) return null;
  // UUID pattern — use directly
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrId)) {
    return nameOrId;
  }
  const { data, error } = await supabase
    .from("groups")
    .select("id, name")
    .ilike("name", nameOrId.trim())
    .maybeSingle();
  if (error) fail(`DB error looking up group: ${error.message}`);
  if (!data) fail(`Group not found: "${nameOrId}". Run 'group list' to see available groups.`);
  return data.id;
}

async function ensureParentRole(supabase, profileId, currentRoles) {
  if (currentRoles.includes("parent")) return;
  const updated = [...new Set([...currentRoles, "parent"])];
  const { error } = await supabase
    .from("profiles")
    .update({ roles: updated })
    .eq("id", profileId);
  if (error) fail(`Failed to add parent role: ${error.message}`);
}

// ---------------------------------------------------------------------------
// USER commands
// ---------------------------------------------------------------------------

async function userFind(supabase, args) {
  if (!args.email) fail("--email is required");
  const profile = await findProfileByEmail(supabase, args.email);
  if (!profile) {
    succeed({ action: "not_found", email: args.email });
  } else {
    succeed({ action: "found", ...profile });
  }
}

async function userCreate(supabase, args) {
  if (!args.email) fail("--email is required");
  if (!args.name) fail("--name is required");
  if (!args.roles) fail("--roles is required (comma-separated: roll_model, parent, rider, admin)");

  const email = args.email.trim().toLowerCase();
  const name = args.name.trim();
  const roles = args.roles
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);

  for (const role of roles) {
    if (!IMPORTABLE_ROLES.has(role)) {
      fail(`Invalid role "${role}". Allowed: ${[...IMPORTABLE_ROLES].join(", ")}. (super_admin can only be granted via the app UI)`);
    }
  }

  // Idempotent: return existing profile if email already exists
  const existing = await findProfileByEmail(supabase, email);
  if (existing) {
    log(`User already exists: ${email}`);
    succeed({ action: "existing", ...existing });
    return;
  }

  // Create auth user (no invite email yet — use 'user invite' separately)
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { full_name: name },
    });

  if (authError || !authData?.user) {
    fail(`Failed to create auth user: ${authError?.message ?? "unknown error"}`);
  }

  const userId = authData.user.id;

  // Update the auto-created profile row
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: name,
      roles,
      invite_status: "pending",
      invited_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id, full_name, email, roles, invite_status")
    .single();

  if (profileError) fail(`Failed to update profile: ${profileError.message}`);

  log(`Created user: ${email}`);
  succeed({ action: "created", ...profile });
}

async function userAddRole(supabase, args) {
  if (!args.email) fail("--email is required");
  if (!args.role) fail("--role is required");

  const role = args.role.trim().toLowerCase();
  if (!ALL_ROLES.has(role)) fail(`Invalid role "${role}"`);
  if (role === "super_admin") fail("super_admin can only be granted via the app UI");

  const profile = await findProfileByEmail(supabase, args.email);
  if (!profile) fail(`User not found: ${args.email}`);

  if (profile.roles.includes(role)) {
    log(`User already has role "${role}": ${args.email}`);
    succeed({ action: "no_change", id: profile.id, roles: profile.roles });
    return;
  }

  const updatedRoles = [...new Set([...profile.roles, role])];
  const { error } = await supabase
    .from("profiles")
    .update({ roles: updatedRoles })
    .eq("id", profile.id);

  if (error) fail(`Failed to update roles: ${error.message}`);

  log(`Added role "${role}" to ${args.email}`);
  succeed({ action: "updated", id: profile.id, roles: updatedRoles });
}

async function userInvite(supabase, args) {
  if (!args.email) fail("--email is required");

  const email = args.email.trim().toLowerCase();
  const profile = await findProfileByEmail(supabase, email);
  if (!profile) fail(`User not found: ${email}. Create them first with 'user create'.`);

  if (profile.invite_status === "accepted") {
    log(`User has already accepted their invite: ${email}`);
    succeed({ action: "already_accepted", id: profile.id });
    return;
  }

  const { error } = await supabase.auth.admin.inviteUserByEmail(email);
  if (error) fail(`Failed to send invite: ${error.message}`);

  // Mark invited_at
  await supabase
    .from("profiles")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", profile.id);

  log(`Invite sent to ${email}`);
  succeed({ action: "invited", id: profile.id, email });
}

async function userList(supabase, args) {
  let query = supabase
    .from("profiles")
    .select("id, full_name, email, roles, invite_status")
    .order("full_name");

  const { data, error } = await query;
  if (error) fail(`DB error: ${error.message}`);

  let profiles = data ?? [];
  if (args.role) {
    const filterRole = args.role.trim().toLowerCase();
    profiles = profiles.filter((p) => p.roles.includes(filterRole));
  }

  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: true, count: profiles.length, profiles }));
  } else {
    console.log(`\n${profiles.length} user(s):\n`);
    for (const p of profiles) {
      console.log(
        `  ${p.full_name.padEnd(28)} ${p.email.padEnd(35)} [${p.roles.join(", ")}]  ${p.invite_status}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// RIDER commands
// ---------------------------------------------------------------------------

async function riderCreate(supabase, args) {
  if (!args.first) fail("--first is required");
  if (!args.last) fail("--last is required");
  if (!args.dob) fail("--dob is required (YYYY-MM-DD)");
  if (!args.parentEmail) fail("--parent-email is required");

  const firstName = args.first.trim();
  const lastName = args.last.trim();
  const dob = args.dob.trim();
  const parentEmail = args.parentEmail.trim().toLowerCase();
  const medical = args.medical?.trim() || null;
  const mediaOptOut = !!args.mediaOptOut;

  // Validate DOB format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) fail("--dob must be in YYYY-MM-DD format");

  // Resolve group if provided
  const groupId = args.group ? await resolveGroupByName(supabase, args.group) : null;

  // Idempotent: check for existing rider by name + DOB
  const { data: existingRiders, error: findError } = await supabase
    .from("riders")
    .select("id, first_name, last_name, date_of_birth, group_id")
    .ilike("first_name", firstName)
    .ilike("last_name", lastName)
    .eq("date_of_birth", dob);

  if (findError) fail(`DB error finding rider: ${findError.message}`);

  let riderId;
  let riderAction;

  if (existingRiders && existingRiders.length > 0) {
    riderId = existingRiders[0].id;
    riderAction = "existing";
    log(`Rider already exists: ${firstName} ${lastName} (${dob})`);

    // Update group and/or medical if provided
    const updates = {};
    if (groupId) updates.group_id = groupId;
    if (medical) updates.medical_notes = medical;
    if (args.mediaOptOut !== undefined) updates.media_opt_out = mediaOptOut;

    if (Object.keys(updates).length > 0) {
      await supabase.from("riders").update(updates).eq("id", riderId);
    }
  } else {
    const insert = {
      first_name: firstName,
      last_name: lastName,
      date_of_birth: dob,
      media_opt_out: mediaOptOut,
    };
    if (groupId) insert.group_id = groupId;
    if (medical) insert.medical_notes = medical;

    const { data: newRider, error: insertError } = await supabase
      .from("riders")
      .insert(insert)
      .select("id")
      .single();

    if (insertError || !newRider) fail(`Failed to create rider: ${insertError?.message}`);

    riderId = newRider.id;
    riderAction = "created";
    log(`Created rider: ${firstName} ${lastName} (${dob})`);
  }

  // Resolve or create parent profile
  let parentProfile = await findProfileByEmail(supabase, parentEmail);

  if (!parentProfile) {
    // Parent doesn't exist yet — create them without an invite
    // Caller should separately run 'user create' then 'user invite'
    fail(
      `Parent not found: ${parentEmail}. Create them first with:\n  user create --email "${parentEmail}" --name "<Parent Name>" --roles parent`
    );
  }

  // Ensure parent role
  await ensureParentRole(supabase, parentProfile.id, parentProfile.roles);

  // Link rider to parent (upsert — safe to run multiple times)
  const { error: linkError } = await supabase.from("rider_parents").upsert(
    {
      rider_id: riderId,
      parent_id: parentProfile.id,
      relationship: "parent",
      is_primary: true,
    },
    { onConflict: "rider_id,parent_id" }
  );

  if (linkError) fail(`Failed to link parent: ${linkError.message}`);

  succeed({
    action: riderAction,
    rider_id: riderId,
    first_name: firstName,
    last_name: lastName,
    date_of_birth: dob,
    group_id: groupId,
    parent_id: parentProfile.id,
    parent_email: parentEmail,
  });
}

async function riderFind(supabase, args) {
  if (!args.first && !args.last) fail("--first and/or --last is required");

  let query = supabase
    .from("riders")
    .select("id, first_name, last_name, date_of_birth, group_id, medical_notes, media_opt_out");

  if (args.first) query = query.ilike("first_name", `%${args.first.trim()}%`);
  if (args.last) query = query.ilike("last_name", `%${args.last.trim()}%`);

  const { data, error } = await query.order("last_name").order("first_name");
  if (error) fail(`DB error: ${error.message}`);

  const riders = data ?? [];
  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: true, count: riders.length, riders }));
  } else {
    console.log(`\n${riders.length} rider(s):\n`);
    for (const r of riders) {
      console.log(
        `  ${r.first_name.padEnd(15)} ${r.last_name.padEnd(15)} ${r.date_of_birth ?? "no DOB"}  id:${r.id}`
      );
    }
  }
}

async function riderUpdate(supabase, args) {
  if (!args.id) fail("--id is required");

  const updates = {};
  if (args.group) updates.group_id = await resolveGroupByName(supabase, args.group);
  if (args.medical) updates.medical_notes = args.medical.trim();
  if (args.mediaOptOut !== undefined) updates.media_opt_out = !!args.mediaOptOut;

  if (Object.keys(updates).length === 0) fail("Nothing to update — provide --group, --medical, or --media-opt-out");

  const { error } = await supabase.from("riders").update(updates).eq("id", args.id.trim());
  if (error) fail(`Failed to update rider: ${error.message}`);

  log(`Updated rider ${args.id}`);
  succeed({ action: "updated", id: args.id, ...updates });
}

async function riderLinkParent(supabase, args) {
  if (!args.id) fail("--id is required");
  if (!args.parentEmail) fail("--parent-email is required");

  const relationship = args.relationship?.trim() ?? "parent";
  if (!["parent", "guardian", "emergency_contact"].includes(relationship)) {
    fail('--relationship must be one of: parent, guardian, emergency_contact');
  }

  const parentProfile = await findProfileByEmail(supabase, args.parentEmail);
  if (!parentProfile) fail(`Parent not found: ${args.parentEmail}`);

  await ensureParentRole(supabase, parentProfile.id, parentProfile.roles);

  const { error } = await supabase.from("rider_parents").upsert(
    {
      rider_id: args.id.trim(),
      parent_id: parentProfile.id,
      relationship,
      is_primary: !!args.primary,
    },
    { onConflict: "rider_id,parent_id" }
  );

  if (error) fail(`Failed to link parent: ${error.message}`);

  log(`Linked parent ${args.parentEmail} to rider ${args.id}`);
  succeed({ action: "linked", rider_id: args.id, parent_id: parentProfile.id, relationship });
}

// ---------------------------------------------------------------------------
// GROUP commands
// ---------------------------------------------------------------------------

async function groupList(supabase) {
  const { data, error } = await supabase
    .from("groups")
    .select("id, name, color, description, sort_order")
    .order("sort_order")
    .order("name");

  if (error) fail(`DB error: ${error.message}`);

  const groups = data ?? [];
  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: true, count: groups.length, groups }));
  } else {
    console.log(`\n${groups.length} group(s):\n`);
    for (const g of groups) {
      console.log(`  ${g.name.padEnd(25)} ${g.color}  id:${g.id}`);
    }
  }
}

async function groupCreate(supabase, args) {
  if (!args.name) fail("--name is required");

  const name = args.name.trim();
  const color = args.color?.trim() ?? "#6B7280";

  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) fail("--color must be a valid hex color, e.g. #6B7280");

  // Idempotent: return existing if name matches
  const { data: existing } = await supabase
    .from("groups")
    .select("id, name, color")
    .ilike("name", name)
    .maybeSingle();

  if (existing) {
    log(`Group already exists: ${name}`);
    succeed({ action: "existing", ...existing });
    return;
  }

  const { data: group, error } = await supabase
    .from("groups")
    .insert({ name, color })
    .select("id, name, color")
    .single();

  if (error) fail(`Failed to create group: ${error.message}`);

  log(`Created group: ${name}`);
  succeed({ action: "created", ...group });
}

async function groupAssignRm(supabase, args) {
  if (!args.group) fail("--group is required");
  if (!args.email) fail("--email is required");

  const groupId = await resolveGroupByName(supabase, args.group);
  const profile = await findProfileByEmail(supabase, args.email);
  if (!profile) fail(`User not found: ${args.email}`);

  // Ensure roll_model role
  if (!profile.roles.includes("roll_model")) {
    fail(
      `User ${args.email} does not have the roll_model role. Add it first:\n  user add-role --email "${args.email}" --role roll_model`
    );
  }

  // Upsert into roll_model_groups (idempotent)
  const { error } = await supabase
    .from("roll_model_groups")
    .upsert(
      { roll_model_id: profile.id, group_id: groupId },
      { onConflict: "roll_model_id,group_id" }
    );

  if (error) fail(`Failed to assign roll model to group: ${error.message}`);

  log(`Assigned ${args.email} to group "${args.group}"`);
  succeed({ action: "assigned", roll_model_id: profile.id, group_id: groupId });
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`
everybody.bike club CLI

Usage: node scripts/club-cli.js <command> <subcommand> [options] [--json] [--env <path>]

USER COMMANDS
  user find     --email <email>
  user create   --email <email> --name <name> --roles <role,role,...>
  user add-role --email <email> --role <role>
  user invite   --email <email>
  user list     [--role <role>]

RIDER COMMANDS
  rider create      --first <name> --last <name> --dob <YYYY-MM-DD> --parent-email <email>
                    [--group <name>] [--medical <text>] [--media-opt-out]
  rider find        --first <name> --last <name>
  rider update      --id <uuid> [--group <name>] [--medical <text>] [--media-opt-out]
  rider link-parent --id <uuid> --parent-email <email>
                    [--relationship parent|guardian|emergency_contact] [--primary]

GROUP COMMANDS
  group list
  group create    --name <name> [--color <hex, default #6B7280>]
  group assign-rm --group <name> --email <email>

VALID ROLES (for user create / user add-role)
  rider, roll_model, parent, admin
  (super_admin can only be granted via the web UI)

FLAGS
  --json   Output machine-readable JSON; all log messages go to stderr
  --env    Path to .env file (default: .env in current directory)
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  JSON_MODE = args.json;

  // Load env (for local dev)
  loadEnv(args.env);

  const [command, subcommand] = args._;

  if (!command || command === "help" || args.help) {
    printHelp();
    process.exit(0);
  }

  const supabase = createSupabaseClient();

  try {
    if (command === "user") {
      if (subcommand === "find")         await userFind(supabase, args);
      else if (subcommand === "create")  await userCreate(supabase, args);
      else if (subcommand === "add-role") await userAddRole(supabase, args);
      else if (subcommand === "invite")  await userInvite(supabase, args);
      else if (subcommand === "list")    await userList(supabase, args);
      else fail(`Unknown user subcommand: ${subcommand}. Try: find, create, add-role, invite, list`);
    } else if (command === "rider") {
      if (subcommand === "create")          await riderCreate(supabase, args);
      else if (subcommand === "find")       await riderFind(supabase, args);
      else if (subcommand === "update")     await riderUpdate(supabase, args);
      else if (subcommand === "link-parent") await riderLinkParent(supabase, args);
      else fail(`Unknown rider subcommand: ${subcommand}. Try: create, find, update, link-parent`);
    } else if (command === "group") {
      if (subcommand === "list")           await groupList(supabase);
      else if (subcommand === "create")    await groupCreate(supabase, args);
      else if (subcommand === "assign-rm") await groupAssignRm(supabase, args);
      else fail(`Unknown group subcommand: ${subcommand}. Try: list, create, assign-rm`);
    } else {
      fail(`Unknown command: ${command}. Try: user, rider, group, help`);
    }
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

main();
