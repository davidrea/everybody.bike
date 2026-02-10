import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { eventSchema } from "@/lib/validators";
import { generateOccurrences } from "@/lib/recurrence";
import crypto from "crypto";
import {
  buildEventNotificationContent,
  getAnnouncementScheduleTime,
  getDefaultReminderTimes,
} from "@/lib/event-notifications";

type EventScheduleInput = {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
};

async function scheduleEventNotifications(
  supabase: Awaited<ReturnType<typeof createClient>>,
  events: EventScheduleInput[],
  createdBy: string,
) {
  const now = new Date();
  const inserts: {
    title: string;
    body: string;
    url: string;
    scheduled_for: string;
    target_type: "event_all" | "event_not_rsvpd";
    target_id: string;
    category: "announcement" | "reminder";
    event_id: string;
    created_by: string;
  }[] = [];

  for (const event of events) {
    const startsAt = new Date(event.starts_at);
    const announcementTime = getAnnouncementScheduleTime(now, startsAt);
    if (announcementTime) {
      const content = buildEventNotificationContent(event, "announcement");
      inserts.push({
        ...content,
        scheduled_for: announcementTime.toISOString(),
        target_type: "event_all",
        target_id: event.id,
        category: "announcement",
        event_id: event.id,
        created_by: createdBy,
      });
    }

    const reminderTimes = getDefaultReminderTimes(startsAt, now);
    for (const reminderTime of reminderTimes) {
      const content = buildEventNotificationContent(event, "reminder");
      inserts.push({
        ...content,
        scheduled_for: reminderTime.toISOString(),
        target_type: "event_all",
        target_id: event.id,
        category: "reminder",
        event_id: event.id,
        created_by: createdBy,
      });
    }
  }

  if (inserts.length === 0) return;

  const { error } = await supabase.from("scheduled_notifications").insert(inserts);
  if (error) {
    throw error;
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("group_id");
  const type = searchParams.get("type");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = searchParams.get("limit");

  let query = supabase
    .from("events")
    .select(
      "*, event_groups(group_id, groups(*)), profiles:created_by(id, full_name)",
    )
    .order("starts_at", { ascending: true });

  if (type) {
    query = query.eq("type", type);
  }
  if (from) {
    query = query.gte("starts_at", from);
  }
  if (to) {
    query = query.lte("starts_at", to);
  }
  if (limit) {
    query = query.limit(parseInt(limit, 10));
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If filtering by group, filter client-side since event_groups is a join
  let filtered = data;
  if (groupId) {
    filtered = data.filter((e) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e.event_groups as any[]).some(
        (eg: { group_id: string }) => eg.group_id === groupId,
      ),
    );
  }

  return NextResponse.json(filtered);
}

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
  const parsed = eventSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { group_ids, is_recurring, recurrence_rule, ...eventData } =
    parsed.data;

  if (is_recurring && recurrence_rule) {
    // Create recurring event series
    const seriesId = crypto.randomUUID();
    const startDate = new Date(eventData.starts_at);
    const occurrences = generateOccurrences(recurrence_rule, startDate);

    // Calculate duration if ends_at is set
    const duration =
      eventData.ends_at
        ? new Date(eventData.ends_at).getTime() - startDate.getTime()
        : null;

    const events = occurrences.map((date) => ({
      title: eventData.title,
      type: eventData.type,
      description: eventData.description || null,
      location: eventData.location || null,
      map_url: eventData.map_url || null,
      starts_at: date.toISOString(),
      ends_at: duration
        ? new Date(date.getTime() + duration).toISOString()
        : null,
      rsvp_deadline: eventData.rsvp_deadline || null,
      capacity:
        eventData.capacity !== "" && eventData.capacity !== undefined
          ? Number(eventData.capacity)
          : null,
      weather_notes: eventData.weather_notes || null,
      recurrence_rule: recurrence_rule,
      series_id: seriesId,
      created_by: user.id,
    }));

    const { data: created, error } = await supabase
      .from("events")
      .insert(events)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (group_ids.length > 0) {
      // Create event_groups for each event
      const eventGroupRows = created.flatMap((evt) =>
        group_ids.map((gid) => ({ event_id: evt.id, group_id: gid })),
      );

      const { error: egError } = await supabase
        .from("event_groups")
        .insert(eventGroupRows);

      if (egError) {
        return NextResponse.json({ error: egError.message }, { status: 500 });
      }
    }

    try {
      await scheduleEventNotifications(
        supabase,
        created.map((evt) => ({
          id: evt.id,
          title: evt.title,
          starts_at: evt.starts_at,
          location: evt.location,
        })),
        user.id,
      );
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to schedule notifications" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { count: created.length, series_id: seriesId },
      { status: 201 },
    );
  }

  // Single event
  const { data: event, error } = await supabase
    .from("events")
    .insert({
      title: eventData.title,
      type: eventData.type,
      description: eventData.description || null,
      location: eventData.location || null,
      map_url: eventData.map_url || null,
      starts_at: eventData.starts_at,
      ends_at: eventData.ends_at || null,
      rsvp_deadline: eventData.rsvp_deadline || null,
      capacity:
        eventData.capacity !== "" && eventData.capacity !== undefined
          ? Number(eventData.capacity)
          : null,
      weather_notes: eventData.weather_notes || null,
      recurrence_rule: null,
      series_id: null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (group_ids.length > 0) {
    // Create event_groups
    const { error: egError } = await supabase
      .from("event_groups")
      .insert(group_ids.map((gid) => ({ event_id: event.id, group_id: gid })));

    if (egError) {
      return NextResponse.json({ error: egError.message }, { status: 500 });
    }
  }

  try {
    await scheduleEventNotifications(
      supabase,
      [
        {
          id: event.id,
          title: event.title,
          starts_at: event.starts_at,
          location: event.location,
        },
      ],
      user.id,
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to schedule notifications" },
      { status: 500 },
    );
  }

  return NextResponse.json(event, { status: 201 });
}
