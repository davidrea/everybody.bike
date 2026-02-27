import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function escapeIcal(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545 §3.1: fold lines longer than 75 octets
function foldLine(line: string): string {
  const chunks: string[] = [];
  let remaining = line;
  while (remaining.length > 75) {
    chunks.push(remaining.slice(0, 75));
    remaining = " " + remaining.slice(75);
  }
  chunks.push(remaining);
  return chunks.join("\r\n");
}

function toIcalDatetime(dateStr: string): string {
  return new Date(dateStr)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = createAdminClient();

  // Resolve token to a profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, roles, rider_group_id")
    .eq("calendar_token", token)
    .single();

  if (!profile) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const isAdmin =
    profile.roles.includes("admin") || profile.roles.includes("super_admin");
  const isRollModel = profile.roles.includes("roll_model");
  const isRider = profile.roles.includes("rider");
  const isParent = profile.roles.includes("parent");

  // Collect the group IDs this user cares about
  const relevantGroupIds: string[] = [];

  if (isRider && profile.rider_group_id) {
    relevantGroupIds.push(profile.rider_group_id);
  }

  if (isRollModel) {
    const { data: rmGroups } = await supabase
      .from("roll_model_groups")
      .select("group_id")
      .eq("roll_model_id", profile.id);
    if (rmGroups) {
      relevantGroupIds.push(...rmGroups.map((g) => g.group_id));
    }
  }

  if (isParent) {
    const { data: links } = await supabase
      .from("rider_parents")
      .select("riders(group_id)")
      .eq("parent_id", profile.id);
    if (links) {
      for (const link of links) {
        const rider = link.riders as unknown as { group_id: string | null };
        if (rider?.group_id) {
          relevantGroupIds.push(rider.group_id);
        }
      }
    }
  }

  const groupIdSet = new Set(relevantGroupIds);

  // Fetch all events with their group assignments
  const { data: allEvents, error } = await supabase
    .from("events")
    .select(
      "id, title, description, location, starts_at, ends_at, event_groups(group_id)",
    )
    .order("starts_at", { ascending: true });

  if (error) {
    return new NextResponse("Internal Server Error", { status: 500 });
  }

  // Admins see everything; everyone else sees ungrouped events + their groups
  const events = isAdmin
    ? (allEvents ?? [])
    : (allEvents ?? []).filter((event) => {
        const eGroups = (
          event.event_groups as { group_id: string }[]
        );
        if (eGroups.length === 0) return true;
        return eGroups.some((eg) => groupIdSet.has(eg.group_id));
      });

  const dtstamp = toIcalDatetime(new Date().toISOString());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//everybody.bike//EN",
    foldLine("X-WR-CALNAME:everybody.bike"),
    foldLine(
      "X-WR-CALDESC:Mountain bike club rides\\, clinics\\, and events",
    ),
    "CALSCALE:GREGORIAN",
  ];

  for (const event of events) {
    const dtstart = toIcalDatetime(event.starts_at);
    const dtend = toIcalDatetime(
      event.ends_at ??
        new Date(
          new Date(event.starts_at).getTime() + 2 * 60 * 60 * 1000,
        ).toISOString(),
    );

    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:${event.id}@everybody.bike`));
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${dtstart}`);
    lines.push(`DTEND:${dtend}`);
    lines.push(foldLine(`SUMMARY:${escapeIcal(event.title)}`));
    if (event.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeIcal(event.description)}`));
    }
    if (event.location) {
      lines.push(foldLine(`LOCATION:${escapeIcal(event.location)}`));
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  const ical = lines.join("\r\n") + "\r\n";

  return new NextResponse(ical, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="everybody-bike.ics"',
      // Allow calendar clients to cache for up to 1 hour
      "Cache-Control": "private, max-age=3600",
    },
  });
}
