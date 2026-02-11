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

  // Phase 1: Event + RSVPs in parallel (RSVPs only need eventId)
  const [eventResult, rsvpsResult] = await Promise.all([
    supabase
      .from("events")
      .select("*, event_groups(group_id, groups(*))")
      .eq("id", eventId)
      .single(),
    supabase
      .from("rsvps")
      .select("*")
      .eq("event_id", eventId),
  ]);

  const { data: event, error: eventError } = eventResult;
  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const { data: rsvps } = rsvpsResult;

  const groupIds = (event.event_groups as { group_id: string }[]).map(
    (eg) => eg.group_id,
  );

  // Build lookup for RSVPs
  const selfRsvpMap = new Map<string, { status: string; assigned_group_id: string | null }>();
  const riderRsvpMap = new Map<string, string>();

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

  if (!groupIds.length) {
    const selfRsvpUserIds = Array.from(selfRsvpMap.keys());
    const riderRsvpIds = Array.from(riderRsvpMap.keys());

    // Fetch profiles and minor riders in parallel
    const [selfProfilesResult, minorRidersResult] = await Promise.all([
      selfRsvpUserIds.length
        ? supabase
            .from("profiles")
            .select(
              "id, full_name, avatar_url, medical_alerts, media_opt_out, roles, rider_group_id",
            )
            .in("id", selfRsvpUserIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string; avatar_url: string | null; medical_alerts: string | null; media_opt_out: boolean; roles: string[]; rider_group_id: string | null }[] }),
      riderRsvpIds.length
        ? supabase
            .from("riders")
            .select("id, first_name, last_name, group_id, medical_notes, media_opt_out")
            .in("id", riderRsvpIds)
        : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string; group_id: string | null; medical_notes: string | null; media_opt_out: boolean }[] }),
    ]);

    const selfProfiles = selfProfilesResult.data ?? [];
    const minorRiders = minorRidersResult.data ?? [];

    const rollModelCandidates =
      selfProfiles.filter(
        (p) =>
          p.roles?.includes("roll_model") ||
          p.roles?.includes("admin") ||
          p.roles?.includes("super_admin"),
      ) ?? [];

    const adultRiders =
      selfProfiles.filter((p) => p.roles?.includes("rider")) ?? [];

    const riderGroupIds = new Set<string>();
    minorRiders.forEach((r) => {
      if (r.group_id) riderGroupIds.add(r.group_id);
    });
    adultRiders.forEach((r) => {
      if (r.rider_group_id) riderGroupIds.add(r.rider_group_id);
    });

    const { data: groupsData } = riderGroupIds.size
      ? await supabase
          .from("groups")
          .select("*")
          .in("id", Array.from(riderGroupIds))
      : { data: [] };

    const groups = groupsData ?? [];
    const groupNameById = new Map(groups.map((group) => [group.id, group.name]));

    const buildRollModelWithAssignment = (
      rm: {
        id: string;
        full_name: string;
        avatar_url: string | null;
        medical_alerts: string | null;
        media_opt_out: boolean;
      },
      assignedGroupId: string | null,
    ) => ({
      ...rm,
      assigned_group_id: assignedGroupId,
      assigned_group_name: assignedGroupId
        ? (groupNameById.get(assignedGroupId) ?? null)
        : null,
    });

    const rmConfirmed = rollModelCandidates
      .map((rm) => {
        const rsvp = selfRsvpMap.get(rm.id);
        if (rsvp?.status !== "yes") return null;
        return buildRollModelWithAssignment(rm, rsvp.assigned_group_id);
      })
      .filter((rm): rm is ReturnType<typeof buildRollModelWithAssignment> => rm !== null);

    const rmMaybe = rollModelCandidates
      .map((rm) => {
        const rsvp = selfRsvpMap.get(rm.id);
        if (rsvp?.status !== "maybe") return null;
        return buildRollModelWithAssignment(rm, rsvp.assigned_group_id);
      })
      .filter((rm): rm is ReturnType<typeof buildRollModelWithAssignment> => rm !== null);

    const rmNo = rollModelCandidates
      .map((rm) => {
        const rsvp = selfRsvpMap.get(rm.id);
        if (rsvp?.status !== "no") return null;
        return buildRollModelWithAssignment(rm, rsvp.assigned_group_id);
      })
      .filter((rm): rm is ReturnType<typeof buildRollModelWithAssignment> => rm !== null);

    const rmNotResponded: ReturnType<typeof buildRollModelWithAssignment>[] = [];

    const rmConfirmedUnassigned = rmConfirmed.filter(
      (rm) => rm.assigned_group_id === null,
    );

    const unassignedGroup = {
      id: "unassigned",
      name: "Unassigned",
      color: "#9CA3AF",
      description: null,
      sort_order: 0,
      created_at: new Date().toISOString(),
    };

    const hasRiders = minorRiders.length + adultRiders.length > 0;
    const hasUnassignedRiders =
      minorRiders.some((r) => !r.group_id) ||
      adultRiders.some((r) => !r.rider_group_id);

    const groupsForRiders = !hasRiders
      ? []
      : hasUnassignedRiders
        ? [...groups, unassignedGroup]
        : groups.length
          ? groups
          : [unassignedGroup];

    const ridersByGroup = groupsForRiders.map((g) => {
      const groupMinors = minorRiders
        .filter((r) => (g.id === "unassigned" ? !r.group_id : r.group_id === g.id))
        .map((r) => ({
          id: r.id,
          name: `${r.first_name} ${r.last_name}`,
          avatar_url: null,
          group_id: r.group_id,
          group_name: g.name,
          is_minor: true,
          status: (riderRsvpMap.get(r.id) ?? null) as string | null,
          medical_alerts: r.medical_notes,
          media_opt_out: r.media_opt_out,
        }));

      const groupAdults = adultRiders
        .filter((r) =>
          g.id === "unassigned" ? !r.rider_group_id : r.rider_group_id === g.id,
        )
        .map((r) => ({
          id: r.id,
          name: r.full_name,
          avatar_url: r.avatar_url,
          group_id: r.rider_group_id,
          group_name: g.name,
          is_minor: false,
          status: (selfRsvpMap.get(r.id)?.status ?? null) as string | null,
          medical_alerts: r.medical_alerts,
          media_opt_out: r.media_opt_out,
        }));

      const allRiders = [...groupMinors, ...groupAdults];
      const confirmedRidersInGroup = allRiders.filter((r) => r.status === "yes").length;

      return {
        group: g,
        confirmed: allRiders.filter((r) => r.status === "yes"),
        maybe: allRiders.filter((r) => r.status === "maybe"),
        no: allRiders.filter((r) => r.status === "no"),
        not_responded: allRiders.filter((r) => !r.status),
        coach_counts: {
          confirmed: 0,
          maybe: 0,
          no: 0,
        },
        coach_rider_ratio: confirmedRidersInGroup > 0 ? 0 : null,
        coaches: {
          confirmed: [],
          maybe: [],
          no: [],
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
        no: rmNo,
        not_responded: rmNotResponded,
        confirmed_unassigned: rmConfirmedUnassigned,
      },
      riders_by_group: ridersByGroup,
      counts: {
        total_roll_models: rollModelCandidates.length,
        confirmed_roll_models: rmConfirmed.length,
        total_riders: totalRiders,
        confirmed_riders: confirmedRiders,
      },
      ratio,
    });
  }

  // Phase 2: Roll models, minor riders, adult riders in parallel (all need groupIds)
  const [rmGroupResult, minorRidersResult, adultRidersResult] = await Promise.all([
    supabase
      .from("roll_model_groups")
      .select(
        "roll_model_id, profiles:roll_model_id(id, full_name, avatar_url, medical_alerts, media_opt_out)",
      )
      .in("group_id", groupIds),
    supabase
      .from("riders")
      .select("id, first_name, last_name, group_id, medical_notes, media_opt_out")
      .in("group_id", groupIds),
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url, rider_group_id, medical_alerts, media_opt_out")
      .in("rider_group_id", groupIds)
      .contains("roles", ["rider"]),
  ]);

  // Deduplicate roll models (may coach multiple event groups)
  const rmGroupRows = (rmGroupResult.data as unknown as {
    roll_model_id: string;
    profiles: {
      id: string;
      full_name: string;
      avatar_url: string | null;
      medical_alerts: string | null;
      media_opt_out: boolean;
    } | null;
  }[]) ?? [];

  const rmMap = new Map<
    string,
    {
      id: string;
      full_name: string;
      avatar_url: string | null;
      medical_alerts: string | null;
      media_opt_out: boolean;
    }
  >();
  rmGroupRows.forEach((row) => {
    const rm = row.profiles;
    if (rm && !rmMap.has(rm.id)) {
      rmMap.set(rm.id, rm);
    }
  });

  // Also include roll_model/admin/super_admin users who self-RSVPed
  // but aren't in roll_model_groups for this event's groups (e.g. role
  // was added after the RSVP, or they coach groups not on this event).
  const additionalRmIds = Array.from(selfRsvpMap.keys()).filter(
    (uid) => !rmMap.has(uid),
  );
  if (additionalRmIds.length > 0) {
    const { data: additionalProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, medical_alerts, media_opt_out, roles")
      .in("id", additionalRmIds);
    (additionalProfiles ?? []).forEach((p) => {
      if (
        p.roles?.includes("roll_model") ||
        p.roles?.includes("admin") ||
        p.roles?.includes("super_admin")
      ) {
        rmMap.set(p.id, {
          id: p.id,
          full_name: p.full_name,
          avatar_url: p.avatar_url,
          medical_alerts: p.medical_alerts,
          media_opt_out: p.media_opt_out,
        });
      }
    });
  }

  const allRollModels = Array.from(rmMap.values());

  const minorRiders = (minorRidersResult.data as {
    id: string;
    first_name: string;
    last_name: string;
    group_id: string | null;
    medical_notes: string | null;
    media_opt_out: boolean;
  }[]) ?? [];

  const adultRiders = (adultRidersResult.data as {
    id: string;
    full_name: string;
    avatar_url: string | null;
    rider_group_id: string | null;
    medical_alerts: string | null;
    media_opt_out: boolean;
  }[]) ?? [];

  // Build groups data
  const groups = (event.event_groups as { group_id: string; groups: { id: string; name: string; color: string } }[])
    .map((eg) => eg.groups)
    .filter(Boolean);
  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));

  const buildRollModelWithAssignment = (
    rm: {
      id: string;
      full_name: string;
      avatar_url: string | null;
      medical_alerts: string | null;
      media_opt_out: boolean;
    },
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

  const rmNo = allRollModels
    .map((rm) => {
      const rsvp = selfRsvpMap.get(rm.id);
      if (rsvp?.status !== "no") return null;
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
        medical_alerts: r.medical_notes,
        media_opt_out: r.media_opt_out,
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
        medical_alerts: r.medical_alerts,
        media_opt_out: r.media_opt_out,
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
      no: rmNo,
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
