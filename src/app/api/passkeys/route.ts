import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "GET /api/passkeys" }, "Unauthenticated");
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("passkey_credentials")
    .select("id, name, device_type, backed_up, created_at, last_used_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error({ route: "GET /api/passkeys", userId: user.id, err: error }, "Failed to fetch passkeys");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ passkeys: data ?? [] });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "PATCH /api/passkeys" }, "Unauthenticated");
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const id = typeof body?.id === "string" ? body.id : null;
  const name =
    typeof body?.name === "string" && body.name.trim().length > 0
      ? body.name.trim()
      : null;

  if (!id) {
    logger.warn({ route: "PATCH /api/passkeys", userId: user.id }, "Missing passkey id");
    return NextResponse.json({ error: "Missing passkey id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("passkey_credentials")
    .update({ name })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    logger.error({ route: "PATCH /api/passkeys", userId: user.id, passkeyId: id, err: error }, "Failed to update passkey");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info({ route: "PATCH /api/passkeys", userId: user.id, passkeyId: id }, "Passkey updated");
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "DELETE /api/passkeys" }, "Unauthenticated");
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const id = typeof body?.id === "string" ? body.id : null;

  if (!id) {
    logger.warn({ route: "DELETE /api/passkeys", userId: user.id }, "Missing passkey id");
    return NextResponse.json({ error: "Missing passkey id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("passkey_credentials")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    logger.error({ route: "DELETE /api/passkeys", userId: user.id, passkeyId: id, err: error }, "Failed to delete passkey");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info({ route: "DELETE /api/passkeys", userId: user.id, passkeyId: id }, "Passkey deleted");
  return NextResponse.json({ ok: true });
}
