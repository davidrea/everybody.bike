import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");

  if (!eventId) {
    return NextResponse.json(
      { error: "event_id is required" },
      { status: 400 },
    );
  }

  // Self-RSVP
  const { data: selfRsvp } = await supabase
    .from("rsvps")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .is("rider_id", null)
    .maybeSingle();

  // Minor rider RSVPs for any rider linked to this parent
  const { data: riderLinks } = await supabase
    .from("rider_parents")
    .select("rider_id")
    .eq("parent_id", user.id);

  const riderIds = (riderLinks ?? [])
    .map((link) => link.rider_id)
    .filter(Boolean);

  const { data: minorRsvps } = riderIds.length
    ? await supabase
        .from("rsvps")
        .select("*, riders:rider_id(id, first_name, last_name)")
        .eq("event_id", eventId)
        .in("rider_id", riderIds)
        .not("rider_id", "is", null)
    : { data: [] };

  return NextResponse.json({
    selfRsvp,
    minorRsvps: minorRsvps ?? [],
  });
}
