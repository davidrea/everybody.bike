import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: 'DELETE /api/admin/notifications/[id]' }, 'Unauthenticated');
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
    logger.warn({ route: 'DELETE /api/admin/notifications/[id]', userId: user.id }, 'Forbidden: not admin');
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("scheduled_notifications")
    .delete()
    .eq("id", id)
    .eq("sent", false);

  if (error) {
    logger.error({ route: 'DELETE /api/admin/notifications/[id]', userId: user.id, notificationId: id, err: error }, 'Failed to delete scheduled notification');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info({ route: 'DELETE /api/admin/notifications/[id]', userId: user.id, notificationId: id }, 'Scheduled notification deleted');
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: 'PATCH /api/admin/notifications/[id]' }, 'Unauthenticated');
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
    logger.warn({ route: 'PATCH /api/admin/notifications/[id]', userId: user.id }, 'Forbidden: not admin');
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const scheduledFor = body?.scheduled_for as string | undefined;
  const targetType = body?.target_type as string | undefined;
  const updates: { scheduled_for?: string; target_type?: string } = {};

  if (scheduledFor) {
    const parsedDate = new Date(scheduledFor);
    if (Number.isNaN(parsedDate.getTime())) {
      logger.warn({ route: 'PATCH /api/admin/notifications/[id]', userId: user.id, notificationId: id }, 'Invalid scheduled time');
      return NextResponse.json({ error: "Invalid scheduled time" }, { status: 400 });
    }
    updates.scheduled_for = parsedDate.toISOString();
  }

  if (targetType) {
    const allowed = new Set([
      "all",
      "group",
      "event_all",
      "event_rsvpd",
      "event_not_rsvpd",
    ]);
    if (!allowed.has(targetType)) {
      logger.warn({ route: 'PATCH /api/admin/notifications/[id]', userId: user.id, notificationId: id, targetType }, 'Invalid target type');
      return NextResponse.json({ error: "Invalid target type" }, { status: 400 });
    }
    updates.target_type = targetType;
  }

  if (Object.keys(updates).length === 0) {
    logger.warn({ route: 'PATCH /api/admin/notifications/[id]', userId: user.id, notificationId: id }, 'No updates provided');
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("scheduled_notifications")
    .update(updates)
    .eq("id", id)
    .eq("sent", false)
    .select()
    .single();

  if (error) {
    logger.error({ route: 'PATCH /api/admin/notifications/[id]', userId: user.id, notificationId: id, err: error }, 'Failed to update scheduled notification');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    logger.warn({ route: 'PATCH /api/admin/notifications/[id]', userId: user.id, notificationId: id }, 'Notification not found or already sent');
    return NextResponse.json({ error: "Notification not found or already sent" }, { status: 404 });
  }

  logger.info({ route: 'PATCH /api/admin/notifications/[id]', userId: user.id, notificationId: id }, 'Scheduled notification updated');
  return NextResponse.json(data);
}
