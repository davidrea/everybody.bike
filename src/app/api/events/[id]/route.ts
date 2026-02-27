import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { eventSchema } from "@/lib/validators";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("events")
    .select(
      "*, event_groups(group_id, groups(*)), profiles:created_by(id, full_name)",
    )
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
  const { edit_mode } = body; // "single" or "series"

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { group_ids, ...eventData } = parsed.data;

  const updatePayload = {
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
  };

  if (edit_mode === "series") {
    // Get the series_id for this event
    const { data: event } = await supabase
      .from("events")
      .select("series_id, starts_at")
      .eq("id", id)
      .single();

    if (!event?.series_id) {
      return NextResponse.json(
        { error: "Event is not part of a series" },
        { status: 400 },
      );
    }

    // Fetch all future events in the series (need starts_at to preserve each event's date)
    const { data: seriesEvents, error: fetchError } = await supabase
      .from("events")
      .select("id, starts_at")
      .eq("series_id", event.series_id)
      .gte("starts_at", event.starts_at);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (seriesEvents && seriesEvents.length > 0) {
      const { title, type, description, location, map_url, rsvp_deadline, capacity, weather_notes } = updatePayload;

      // Extract just the time portion from the submitted starts_at
      // (datetime-local format: "YYYY-MM-DDTHH:MM", no timezone info)
      // This preserves each event's own date while applying the new time to all.
      const newStartTimePart = updatePayload.starts_at.split("T")[1] ?? "00:00";
      const newEndTimePart = updatePayload.ends_at
        ? updatePayload.ends_at.split("T")[1] ?? null
        : null;

      for (const seriesEvent of seriesEvents) {
        const datePart = seriesEvent.starts_at.split("T")[0];
        await supabase
          .from("events")
          .update({
            title,
            type,
            description,
            location,
            map_url,
            rsvp_deadline,
            capacity,
            weather_notes,
            starts_at: `${datePart}T${newStartTimePart}`,
            ends_at: newEndTimePart ? `${datePart}T${newEndTimePart}` : null,
          })
          .eq("id", seriesEvent.id);
      }

      // Update event_groups for all future events in series
      const eventIds = seriesEvents.map((e) => e.id);
      await supabase.from("event_groups").delete().in("event_id", eventIds);
      const newRows = eventIds.flatMap((eid) =>
        group_ids.map((gid) => ({ event_id: eid, group_id: gid })),
      );
      if (newRows.length > 0) {
        await supabase.from("event_groups").insert(newRows);
      }
    }

    return NextResponse.json({ success: true, mode: "series" });
  }

  // Single event update
  const { error } = await supabase
    .from("events")
    .update(updatePayload)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update event_groups
  await supabase.from("event_groups").delete().eq("event_id", id);
  const newGroups = group_ids.map((gid) => ({
    event_id: id,
    group_id: gid,
  }));
  if (newGroups.length > 0) {
    await supabase.from("event_groups").insert(newGroups);
  }

  return NextResponse.json({ success: true, mode: "single" });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const { searchParams } = new URL(request.url);
  const deleteMode = searchParams.get("mode") ?? "single";

  if (deleteMode === "series") {
    const { data: event } = await supabase
      .from("events")
      .select("series_id, starts_at")
      .eq("id", id)
      .single();

    if (!event?.series_id) {
      return NextResponse.json(
        { error: "Event is not part of a series" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("events")
      .delete()
      .eq("series_id", event.series_id)
      .gte("starts_at", event.starts_at);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, mode: "series" });
  }

  // Single delete
  const { error } = await supabase.from("events").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, mode: "single" });
}
