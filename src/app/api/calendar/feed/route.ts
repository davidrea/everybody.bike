import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/url";

const RSVP_LABELS: Record<string, string> = {
  yes: "Yes",
  no: "No",
  maybe: "Maybe",
};

function formatUtc(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

function escapeIcalText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line: string) {
  const max = 75;
  if (line.length <= max) return [line];
  const parts: string[] = [];
  let current = line;
  while (current.length > max) {
    parts.push(current.slice(0, max));
    current = " " + current.slice(max);
  }
  parts.push(current);
  return parts;
}

function buildCalendar(lines: string[]) {
  return lines.flatMap(foldLine).join("\r\n") + "\r\n";
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) {
    return new Response("Missing calendar token.", { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, roles, rider_group_id")
    .eq("calendar_token", token)
    .single();

  if (profileError || !profile) {
    return new Response("Calendar not found.", { status: 404 });
  }

  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  const defaultTo = new Date(now);
  defaultTo.setMonth(defaultTo.getMonth() + 6);

  const from = parseDate(searchParams.get("from")) ?? defaultFrom;
  const to = parseDate(searchParams.get("to")) ?? defaultTo;

  if (from > to) {
    return new Response("Invalid date range.", { status: 400 });
  }

  const isAdmin =
    profile.roles?.includes("admin") || profile.roles?.includes("super_admin");

  const groupIds = new Set<string>();
  const linkedRiders: { id: string; name: string; group_id: string | null }[] = [];

  if (!isAdmin && profile.rider_group_id) {
    groupIds.add(profile.rider_group_id);
  }

  if (!isAdmin && profile.roles?.includes("roll_model")) {
    const { data: rollModelGroups } = await admin
      .from("roll_model_groups")
      .select("group_id")
      .eq("roll_model_id", profile.id);

    rollModelGroups?.forEach((row) => {
      if (row.group_id) groupIds.add(row.group_id);
    });
  }

  if (profile.roles?.includes("parent")) {
    const { data: riderLinks } = await admin
      .from("rider_parents")
      .select("riders:rider_id(id, first_name, last_name, group_id)")
      .eq("parent_id", profile.id);

    riderLinks?.forEach((row) => {
      const rider = row.riders;
      if (!rider) return;
      if (!isAdmin && rider.group_id) {
        groupIds.add(rider.group_id);
      }
      linkedRiders.push({
        id: rider.id,
        name: `${rider.first_name} ${rider.last_name}`.trim(),
        group_id: rider.group_id ?? null,
      });
    });
  }

  const { data: events, error: eventsError } = await admin
    .from("events")
    .select(
      "id, title, description, location, map_url, starts_at, ends_at, updated_at, event_groups(group_id, groups(name))",
    )
    .gte("starts_at", from.toISOString())
    .lte("starts_at", to.toISOString())
    .order("starts_at", { ascending: true });

  if (eventsError) {
    return new Response("Failed to load events.", { status: 500 });
  }

  const visibleEvents = isAdmin
    ? events ?? []
    : (events ?? []).filter((event) => {
        const groups = (event.event_groups ?? []) as {
          group_id: string | null;
        }[];
        if (groups.length === 0) return true;
        return groups.some((group) => group.group_id && groupIds.has(group.group_id));
      });

  const eventIds = visibleEvents.map((event) => event.id);
  const riderIds = linkedRiders.map((rider) => rider.id);

  const rsvpMap = new Map<string, string>();
  const riderRsvpMap = new Map<string, Map<string, string>>();

  if (eventIds.length > 0) {
    let rsvpQuery = admin
      .from("rsvps")
      .select("event_id, rider_id, status")
      .in("event_id", eventIds);

    if (riderIds.length > 0) {
      rsvpQuery = rsvpQuery.or(
        `and(user_id.eq.${profile.id},rider_id.is.null),rider_id.in.(${riderIds.join(",")})`,
      );
    } else {
      rsvpQuery = rsvpQuery.eq("user_id", profile.id).is("rider_id", null);
    }

    const { data: rsvps } = await rsvpQuery;
    rsvps?.forEach((row) => {
      if (!row.event_id) return;
      if (row.rider_id) {
        if (!riderRsvpMap.has(row.event_id)) {
          riderRsvpMap.set(row.event_id, new Map());
        }
        riderRsvpMap.get(row.event_id)?.set(row.rider_id, row.status);
      } else {
        rsvpMap.set(row.event_id, row.status);
      }
    });
  }

  const baseUrl = getBaseUrl(request);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//everybody.bike//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Everybody Bike Events",
    "X-WR-TIMEZONE:UTC",
  ];

  visibleEvents.forEach((event) => {
    const startsAt = new Date(event.starts_at);
    const endsAt = event.ends_at ? new Date(event.ends_at) : null;
    const updatedAt = event.updated_at ? new Date(event.updated_at) : startsAt;

    const selfStatus = rsvpMap.get(event.id);
    const summaryStatus = selfStatus ? ` [RSVP: ${RSVP_LABELS[selfStatus] ?? "No response"}]` : "";
    const summary = `${event.title}${summaryStatus}`;

    const descriptionLines: string[] = [];
    if (event.description) {
      descriptionLines.push(event.description);
    }

    const groupNames = (event.event_groups ?? [])
      .map((group) => group.groups?.name)
      .filter(Boolean);
    descriptionLines.push(
      `Groups: ${groupNames.length > 0 ? groupNames.join(", ") : "All"}`,
    );

    if (event.location) {
      descriptionLines.push(`Location: ${event.location}`);
    }
    if (event.map_url) {
      descriptionLines.push(`Map: ${event.map_url}`);
    }

    const selfLabel = selfStatus ? RSVP_LABELS[selfStatus] ?? "No response" : "No response";
    descriptionLines.push(`Your RSVP: ${selfLabel}`);

    if (linkedRiders.length > 0) {
      const riderStatuses = linkedRiders.map((rider) => {
        const status = riderRsvpMap.get(event.id)?.get(rider.id);
        const label = status ? RSVP_LABELS[status] ?? "No response" : "No response";
        return `${rider.name}: ${label}`;
      });
      descriptionLines.push(`Riders: ${riderStatuses.join("; ")}`);
    }

    descriptionLines.push(`Event: ${baseUrl}/events/${event.id}`);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.id}@everybody.bike`);
    lines.push(`DTSTAMP:${formatUtc(updatedAt)}`);
    lines.push(`DTSTART:${formatUtc(startsAt)}`);
    if (endsAt) {
      lines.push(`DTEND:${formatUtc(endsAt)}`);
    }
    lines.push(`SUMMARY:${escapeIcalText(summary)}`);
    lines.push(`DESCRIPTION:${escapeIcalText(descriptionLines.join("\n"))}`);
    if (event.location) {
      lines.push(`LOCATION:${escapeIcalText(event.location)}`);
    }
    lines.push(`URL:${escapeIcalText(`${baseUrl}/events/${event.id}`)}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");

  return new Response(buildCalendar(lines), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
    },
  });
}
