import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildEventNotificationContent } from "@/lib/event-notifications";
import { logger } from "@/lib/logger";

function isAdminRoles(roles?: string[] | null) {
  return roles?.includes("admin") || roles?.includes("super_admin");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: 'GET /api/events/[id]/notifications' }, 'Unauthenticated');
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  if (!isAdminRoles(profile?.roles)) {
    logger.warn({ route: 'GET /api/events/[id]/notifications', userId: user.id }, 'Forbidden: not admin');
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("scheduled_notifications")
    .select("*")
    .eq("event_id", id)
    .order("scheduled_for", { ascending: true });

  if (error) {
    logger.error({ route: 'GET /api/events/[id]/notifications', userId: user.id, err: error }, 'Failed to fetch notifications');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: 'POST /api/events/[id]/notifications' }, 'Unauthenticated');
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  if (!isAdminRoles(profile?.roles)) {
    logger.warn({ route: 'POST /api/events/[id]/notifications', userId: user.id }, 'Forbidden: not admin');
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const category = body?.category as "announcement" | "reminder" | undefined;
  const targetType = body?.target_type as "event_all" | "event_not_rsvpd" | undefined;
  const scheduledFor = body?.scheduled_for as string | undefined;

  if (!category || !targetType || !scheduledFor) {
    logger.warn({ route: 'POST /api/events/[id]/notifications', userId: user.id }, 'Missing required fields');
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (category === "announcement" && targetType !== "event_all") {
    logger.warn({ route: 'POST /api/events/[id]/notifications', userId: user.id }, 'Invalid target type for announcement');
    return NextResponse.json({ error: "Announcement must target event audience" }, { status: 400 });
  }

  if (category === "reminder" && targetType !== "event_all" && targetType !== "event_not_rsvpd") {
    logger.warn({ route: 'POST /api/events/[id]/notifications', userId: user.id }, 'Invalid target type for reminder');
    return NextResponse.json({ error: "Reminder target type is invalid" }, { status: 400 });
  }

  const scheduledDate = new Date(scheduledFor);
  if (Number.isNaN(scheduledDate.getTime())) {
    logger.warn({ route: 'POST /api/events/[id]/notifications', userId: user.id }, 'Invalid scheduled time');
    return NextResponse.json({ error: "Invalid scheduled time" }, { status: 400 });
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title, starts_at, location")
    .eq("id", id)
    .single();

  if (eventError || !event) {
    logger.warn({ route: 'POST /api/events/[id]/notifications', userId: user.id, eventId: id }, 'Event not found');
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (scheduledDate.getTime() >= new Date(event.starts_at).getTime()) {
    logger.warn({ route: 'POST /api/events/[id]/notifications', userId: user.id, eventId: id }, 'Scheduled time not before event start');
    return NextResponse.json({ error: "Scheduled time must be before the event" }, { status: 400 });
  }

  if (category === "announcement") {
    const { data: existing } = await supabase
      .from("scheduled_notifications")
      .select("id")
      .eq("event_id", id)
      .eq("category", "announcement")
      .maybeSingle();

    if (existing) {
      logger.warn({ route: 'POST /api/events/[id]/notifications', userId: user.id, eventId: id }, 'Announcement already scheduled');
      return NextResponse.json({ error: "Announcement already scheduled" }, { status: 409 });
    }
  }

  const content = buildEventNotificationContent(event, category);

  const { data, error } = await supabase
    .from("scheduled_notifications")
    .insert({
      title: content.title,
      body: content.body,
      url: content.url,
      scheduled_for: scheduledDate.toISOString(),
      target_type: targetType,
      target_id: id,
      category,
      event_id: id,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    logger.error({ route: 'POST /api/events/[id]/notifications', userId: user.id, eventId: id, err: error }, 'Failed to insert scheduled notification');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info({ route: 'POST /api/events/[id]/notifications', userId: user.id, eventId: id, notificationId: data.id }, 'Notification scheduled');
  return NextResponse.json(data, { status: 201 });
}
