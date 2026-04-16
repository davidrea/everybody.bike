import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export interface BulkRsvpEntry {
  selfRsvp: { status: string } | null;
  minorRsvps: { rider_id: string; status: string; riders: { id: string; first_name: string; last_name: string } }[];
}

export type BulkRsvpMap = Record<string, BulkRsvpEntry>;

// POST /api/rsvps/mine/bulk
// Body: { event_ids: string[] }
// Returns: BulkRsvpMap
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logger.warn({ route: "POST /api/rsvps/mine/bulk" }, "Unauthenticated");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const eventIds: string[] = Array.isArray(body?.event_ids) ? body.event_ids : [];

  if (eventIds.length === 0) {
    return NextResponse.json({} as BulkRsvpMap);
  }

  // Self RSVPs across all events
  const { data: selfRsvps } = await supabase
    .from("rsvps")
    .select("event_id, status")
    .eq("user_id", user.id)
    .is("rider_id", null)
    .in("event_id", eventIds);

  // Minor rider links for this parent
  const { data: riderLinks } = await supabase
    .from("rider_parents")
    .select("rider_id")
    .eq("parent_id", user.id);

  const riderIds = (riderLinks ?? []).map((l) => l.rider_id).filter(Boolean);

  const { data: minorRsvps } = riderIds.length
    ? await supabase
        .from("rsvps")
        .select("event_id, rider_id, status, riders:rider_id(id, first_name, last_name)")
        .in("event_id", eventIds)
        .in("rider_id", riderIds)
        .not("rider_id", "is", null)
    : { data: [] };

  // Build map keyed by event_id
  const result: BulkRsvpMap = {};
  for (const eventId of eventIds) {
    const selfRsvp = selfRsvps?.find((r) => r.event_id === eventId) ?? null;
    const eventMinorRsvps = (minorRsvps ?? [])
      .filter((r) => r.event_id === eventId)
      .map((r) => ({
        rider_id: r.rider_id as string,
        status: r.status,
        riders: r.riders as unknown as { id: string; first_name: string; last_name: string },
      }));
    if (selfRsvp || eventMinorRsvps.length > 0) {
      result[eventId] = { selfRsvp, minorRsvps: eventMinorRsvps };
    }
  }

  return NextResponse.json(result);
}
