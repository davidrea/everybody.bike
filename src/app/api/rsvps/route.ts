import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rsvpSchema } from "@/lib/validators";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

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

  const { data, error } = await supabase
    .from("rsvps")
    .select(
      "*, profiles:user_id(id, full_name, avatar_url, roles, rider_group_id), riders:rider_id(id, first_name, last_name, group_id)",
    )
    .eq("event_id", eventId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = rsvpSchema.safeParse(body);

  if (!parsed.success) {
    const details = parsed.error.flatten();
    const fieldErrors = Object.entries(details.fieldErrors)
      .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
      .join("; ");
    console.error("[RSVP] Validation failed:", JSON.stringify(body), details);
    return NextResponse.json(
      { error: `Validation failed${fieldErrors ? `: ${fieldErrors}` : ""}`, details },
      { status: 400 },
    );
  }

  const { event_id, status, rider_id, on_behalf_of, assigned_group_id } =
    parsed.data;
  const assignedGroupProvided = Object.prototype.hasOwnProperty.call(
    body,
    "assigned_group_id",
  );
  const normalizedAssignedGroupId = assignedGroupProvided
    ? (assigned_group_id ?? null)
    : undefined;

  if (rider_id && normalizedAssignedGroupId !== undefined && normalizedAssignedGroupId !== null) {
    return NextResponse.json(
      { error: "Minor rider RSVPs cannot have an assigned Roll Model group" },
      { status: 400 },
    );
  }

  // Get caller's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const callerIsAdmin =
    profile?.roles?.includes("admin") ||
    profile?.roles?.includes("super_admin");

  const { data: event } = await supabase
    .from("events")
    .select("id, rsvp_deadline, starts_at, canceled_at, event_groups(group_id)")
    .eq("id", event_id)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.canceled_at) {
    return NextResponse.json(
      { error: "This event is canceled. RSVP changes are disabled." },
      { status: 400 },
    );
  }

  const eventGroupIds = new Set(
    (
      (event.event_groups as { group_id: string }[] | null) ?? []
    ).map((group) => group.group_id),
  );
  const eventHasGroups = eventGroupIds.size > 0;

  // Check RSVP deadline (admins bypass)
  if (!callerIsAdmin) {
    const now = new Date();
    const deadline = event.rsvp_deadline
      ? new Date(event.rsvp_deadline)
      : new Date(event.starts_at);

    if (now > deadline) {
      return NextResponse.json(
        { error: "RSVP deadline has passed" },
        { status: 400 },
      );
    }
  }

  if (on_behalf_of) {
    const eventStart = new Date(event.starts_at);
    if (new Date() > eventStart) {
      return NextResponse.json(
        { error: "Admin RSVP changes are disabled for past events" },
        { status: 400 },
      );
    }
  }

  // Admin override: on_behalf_of
  if (on_behalf_of) {
    if (!callerIsAdmin) {
      return NextResponse.json(
        { error: "Only admins can RSVP on behalf of others" },
        { status: 403 },
      );
    }

    if (rider_id) {
      if (!eventHasGroups) {
        return NextResponse.json(
          { error: "This event is limited to Roll Models and Admins" },
          { status: 403 },
        );
      }
      // Admin RSVPing a minor rider — skip parent-link check
      return upsertMinorRsvp(supabase, event_id, user.id, rider_id, status);
    } else {
      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("roles")
        .eq("id", on_behalf_of)
        .single();

      if (!targetProfile) {
        return NextResponse.json(
          { error: "Target profile not found" },
          { status: 404 },
        );
      }

      if (
        !eventHasGroups &&
        !(
          targetProfile.roles?.includes("roll_model") ||
          targetProfile.roles?.includes("admin") ||
          targetProfile.roles?.includes("super_admin")
        )
      ) {
        return NextResponse.json(
          { error: "This event is limited to Roll Models and Admins" },
          { status: 403 },
        );
      }

      const groupValidationError = await validateAssignedGroup({
        supabase,
        assignedGroupId: normalizedAssignedGroupId,
        eventGroupIds,
        isRollModel: targetProfile.roles?.includes("roll_model") ?? false,
        rollModelId: on_behalf_of,
        enforceCoachAssignment: false,
      });

      if (groupValidationError) {
        return NextResponse.json({ error: groupValidationError }, { status: 400 });
      }

      // Admin RSVPing on behalf of an adult — use on_behalf_of as user_id
      return upsertSelfRsvp(
        supabase,
        event_id,
        on_behalf_of,
        status,
        normalizedAssignedGroupId,
      );
    }
  }

  if (rider_id) {
    // Parent RSVPing for a minor
    if (!eventHasGroups) {
      return NextResponse.json(
        { error: "This event is limited to Roll Models and Admins" },
        { status: 403 },
      );
    }
    if (!profile?.roles?.includes("parent")) {
      return NextResponse.json(
        { error: "Only parents can RSVP for minors" },
        { status: 403 },
      );
    }

    // Verify parent is linked to this rider
    const { data: link } = await supabase
      .from("rider_parents")
      .select("rider_id")
      .eq("rider_id", rider_id)
      .eq("parent_id", user.id)
      .maybeSingle();

    if (!link) {
      return NextResponse.json(
        { error: "You are not linked to this rider" },
        { status: 403 },
      );
    }

    return upsertMinorRsvp(supabase, event_id, user.id, rider_id, status);
  } else {
    // Self-RSVP (roll_model or rider)
    const canSelfRsvp =
      profile?.roles?.includes("roll_model") ||
      (eventHasGroups && profile?.roles?.includes("rider")) ||
      profile?.roles?.includes("admin") ||
      profile?.roles?.includes("super_admin");

    if (!canSelfRsvp) {
      return NextResponse.json(
        { error: "You don't have a role that allows self-RSVP" },
        { status: 403 },
      );
    }

    const groupValidationError = await validateAssignedGroup({
      supabase,
      assignedGroupId: normalizedAssignedGroupId,
      eventGroupIds,
      isRollModel: profile.roles?.includes("roll_model") ?? false,
      rollModelId: user.id,
      enforceCoachAssignment: true,
    });

    if (groupValidationError) {
      return NextResponse.json({ error: groupValidationError }, { status: 400 });
    }

    return upsertSelfRsvp(
      supabase,
      event_id,
      user.id,
      status,
      normalizedAssignedGroupId,
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { event_id, rider_id, on_behalf_of } = body;

  if (!event_id) {
    return NextResponse.json({ error: "event_id is required" }, { status: 400 });
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, starts_at, canceled_at")
    .eq("id", event_id)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.canceled_at) {
    return NextResponse.json(
      { error: "This event is canceled. RSVP changes are disabled." },
      { status: 400 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  const callerIsAdmin =
    profile?.roles?.includes("admin") ||
    profile?.roles?.includes("super_admin");

  if (on_behalf_of && !callerIsAdmin) {
    return NextResponse.json(
      { error: "Only admins can clear RSVPs on behalf of others" },
      { status: 403 },
    );
  }

  if (on_behalf_of) {
    if (new Date() > new Date(event.starts_at)) {
      return NextResponse.json(
        { error: "Admin RSVP changes are disabled for past events" },
        { status: 400 },
      );
    }
  }

  if (rider_id) {
    // Delete a minor rider's RSVP
    if (!callerIsAdmin) {
      // Verify parent link
      const { data: link } = await supabase
        .from("rider_parents")
        .select("rider_id")
        .eq("rider_id", rider_id)
        .eq("parent_id", user.id)
        .maybeSingle();

      if (!link) {
        return NextResponse.json(
          { error: "You are not linked to this rider" },
          { status: 403 },
        );
      }
    }

    const { error } = await supabase
      .from("rsvps")
      .delete()
      .eq("event_id", event_id)
      .eq("rider_id", rider_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    // Delete a self-RSVP (or admin clearing an adult's RSVP)
    const targetUserId = on_behalf_of ?? user.id;

    const { error } = await supabase
      .from("rsvps")
      .delete()
      .eq("event_id", event_id)
      .eq("user_id", targetUserId)
      .is("rider_id", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

async function upsertMinorRsvp(
  supabase: SupabaseClient,
  eventId: string,
  userId: string,
  riderId: string,
  status: string,
) {
  const { data: existing } = await supabase
    .from("rsvps")
    .select("id")
    .eq("event_id", eventId)
    .eq("rider_id", riderId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("rsvps")
      .update({
        status,
        user_id: userId,
        assigned_group_id: null,
        responded_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("rsvps").insert({
      event_id: eventId,
      user_id: userId,
      rider_id: riderId,
      assigned_group_id: null,
      status,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

async function upsertSelfRsvp(
  supabase: SupabaseClient,
  eventId: string,
  userId: string,
  status: string,
  assignedGroupId: string | null | undefined,
) {
  const { data: existing } = await supabase
    .from("rsvps")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .is("rider_id", null)
    .maybeSingle();

  if (existing) {
    const updatePayload: {
      status: string;
      responded_at: string;
      assigned_group_id?: string | null;
    } = {
      status,
      responded_at: new Date().toISOString(),
    };
    if (assignedGroupId !== undefined) {
      updatePayload.assigned_group_id = assignedGroupId;
    }

    const { error } = await supabase
      .from("rsvps")
      .update(updatePayload)
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("rsvps").insert({
      event_id: eventId,
      user_id: userId,
      rider_id: null,
      assigned_group_id: assignedGroupId ?? null,
      status,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

async function validateAssignedGroup({
  supabase,
  assignedGroupId,
  eventGroupIds,
  isRollModel,
  rollModelId,
  enforceCoachAssignment,
}: {
  supabase: SupabaseClient;
  assignedGroupId: string | null | undefined;
  eventGroupIds: Set<string>;
  isRollModel: boolean;
  rollModelId: string;
  enforceCoachAssignment: boolean;
}) {
  if (!assignedGroupId) {
    return null;
  }

  if (!isRollModel) {
    return "Only Roll Models can set an assigned RSVP group";
  }

  if (!eventGroupIds.has(assignedGroupId)) {
    return "Assigned group must be one of this event's groups";
  }

  if (!enforceCoachAssignment) {
    return null;
  }

  const { data: coachAssignment } = await supabase
    .from("roll_model_groups")
    .select("group_id")
    .eq("roll_model_id", rollModelId)
    .eq("group_id", assignedGroupId)
    .maybeSingle();

  if (!coachAssignment) {
    return "You can only assign yourself to groups you coach";
  }

  return null;
}
