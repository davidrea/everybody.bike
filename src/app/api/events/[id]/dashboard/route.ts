import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Get event with groups
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select(
      "*, event_groups(group_id, groups(*))",
    )
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const groupIds = (event.event_groups as { group_id: string }[]).map((eg) => eg.group_id);

  // 2. Get roll models assigned to these groups
  let rmGroupRows: {
    roll_model_id: string;
    profiles: { id: string; full_name: string; avatar_url: string | null } | null;
  }[] = [];
  if (groupIds.length) {
    const { data } = await supabase
      .from("roll_model_groups")
      .select("roll_model_id, profiles:roll_model_id(id, full_name, avatar_url)")
      .in("group_id", groupIds);
    rmGroupRows = (data as typeof rmGroupRows) ?? [];
  }

  // Deduplicate roll models (may coach multiple event groups)
  const rmMap = new Map<
    string,
    { id: string; full_name: string; avatar_url: string | null }
  >();
  rmGroupRows.forEach((row) => {
    const rm = row.profiles;
    if (rm && !rmMap.has(rm.id)) {
      rmMap.set(rm.id, rm);
    }
  });
  const allRollModels = Array.from(rmMap.values());

  // 3. Get minor riders in these groups
  let minorRiders: {
    id: string;
    first_name: string;
    last_name: string;
    group_id: string | null;
  }[] = [];
  if (groupIds.length) {
    const { data } = await supabase
      .from("riders")
      .select("id, first_name, last_name, group_id")
      .in("group_id", groupIds);
    minorRiders = (data as typeof minorRiders) ?? [];
  }

  // 4. Get adult riders in these groups
  let adultRiders: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    rider_group_id: string | null;
  }[] = [];
  if (groupIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, rider_group_id")
      .in("rider_group_id", groupIds)
      .contains("roles", ["rider"]);
    adultRiders = (data as typeof adultRiders) ?? [];
  }

  // 5. Get all RSVPs for this event
  const { data: rsvps } = await supabase
    .from("rsvps")
    .select("*")
    .eq("event_id", eventId);

  // Build lookup for RSVPs
  const selfRsvpMap = new Map<string, { status: string; assigned_group_id: string | null }>(); // user_id -> status + assignment
  const riderRsvpMap = new Map<string, string>(); // rider_id -> status

  (rsvps ?? []).forEach((r) => {
    if (r.rider_id) {
      riderRsvpMap.set(r.rider_id, r.status);
    } else {
      selfRsvpMap.set(r.user_id, {
        status: r.status,
        assigned_group_id: r.assigned_group_id,
      });
    }
  });

  // 6. Build groups data
  const groups = (event.event_groups as { group_id: string; groups: { id: string; name: string; color: string } }[])
    .map((eg) => eg.groups)
    .filter(Boolean);
  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));

  const buildRollModelWithAssignment = (
    rm: { id: string; full_name: string; avatar_url: string | null },
    assignedGroupId: string | null,
  ) => ({
    ...rm,
    assigned_group_id: assignedGroupId,
    assigned_group_name: assignedGroupId
      ? (groupNameById.get(assignedGroupId) ?? null)
      : null,
  });

  // Build roll model status lists
  const rmConfirmed = allRollModels
    .map((rm) => {
      const rsvp = selfRsvpMap.get(rm.id);
      if (rsvp?.status !== "yes") return null;
      return buildRollModelWithAssignment(rm, rsvp.assigned_group_id);
    })
    .filter((rm): rm is ReturnType<typeof buildRollModelWithAssignment> => rm !== null);

  const rmMaybe = allRollModels
    .map((rm) => {
      const rsvp = selfRsvpMap.get(rm.id);
      if (rsvp?.status !== "maybe") return null;
      return buildRollModelWithAssignment(rm, rsvp.assigned_group_id);
    })
    .filter((rm): rm is ReturnType<typeof buildRollModelWithAssignment> => rm !== null);

  const rmNotResponded = allRollModels
    .filter((rm) => !selfRsvpMap.has(rm.id))
    .map((rm) => buildRollModelWithAssignment(rm, null));

  const rmConfirmedUnassigned = rmConfirmed.filter(
    (rm) => rm.assigned_group_id === null,
  );

  // Build riders by group
  const ridersByGroup = groups.map((g) => {
    const groupMinors = minorRiders
      .filter((r) => r.group_id === g.id)
      .map((r) => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`,
        avatar_url: null,
        group_id: r.group_id,
        group_name: g.name,
        is_minor: true,
        status: (riderRsvpMap.get(r.id) ?? null) as string | null,
      }));

    const groupAdults = adultRiders
      .filter((r) => r.rider_group_id === g.id)
      .map((r) => ({
        id: r.id,
        name: r.full_name,
        avatar_url: r.avatar_url,
        group_id: r.rider_group_id,
        group_name: g.name,
        is_minor: false,
        status: (selfRsvpMap.get(r.id)?.status ?? null) as string | null,
      }));

    const allRiders = [...groupMinors, ...groupAdults];
    const confirmedCoaches = rmConfirmed
      .filter((rm) => rm.assigned_group_id === g.id)
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
    const maybeCoaches = rmMaybe
      .filter((rm) => rm.assigned_group_id === g.id)
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
    const noCoaches = allRollModels
      .filter((rm) => {
        const rsvp = selfRsvpMap.get(rm.id);
        return rsvp?.status === "no" && rsvp.assigned_group_id === g.id;
      })
      .map((rm) => buildRollModelWithAssignment(rm, g.id))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    const coachCounts = {
      confirmed: confirmedCoaches.length,
      maybe: maybeCoaches.length,
      no: noCoaches.length,
    };
    const confirmedRidersInGroup = allRiders.filter((r) => r.status === "yes").length;
    const coachRiderRatio =
      confirmedRidersInGroup > 0
        ? coachCounts.confirmed / confirmedRidersInGroup
        : null;

    return {
      group: g,
      confirmed: allRiders.filter((r) => r.status === "yes"),
      maybe: allRiders.filter((r) => r.status === "maybe"),
      no: allRiders.filter((r) => r.status === "no"),
      not_responded: allRiders.filter((r) => !r.status),
      coach_counts: coachCounts,
      coach_rider_ratio: coachRiderRatio,
      coaches: {
        confirmed: confirmedCoaches,
        maybe: maybeCoaches,
        no: noCoaches,
      },
    };
  });

  const totalRiders = ridersByGroup.reduce(
    (sum, g) =>
      sum +
      g.confirmed.length +
      g.maybe.length +
      g.no.length +
      g.not_responded.length,
    0,
  );
  const confirmedRiders = ridersByGroup.reduce(
    (sum, g) => sum + g.confirmed.length,
    0,
  );

  const ratio =
    confirmedRiders > 0 ? rmConfirmed.length / confirmedRiders : null;

  return NextResponse.json({
    event,
    roll_models: {
      confirmed: rmConfirmed,
      maybe: rmMaybe,
      not_responded: rmNotResponded,
      confirmed_unassigned: rmConfirmedUnassigned,
    },
    riders_by_group: ridersByGroup,
    counts: {
      total_roll_models: allRollModels.length,
      confirmed_roll_models: rmConfirmed.length,
      total_riders: totalRiders,
      confirmed_riders: confirmedRiders,
    },
    ratio,
  });
}
