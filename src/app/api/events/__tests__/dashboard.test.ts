import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import { createClient } from "@/lib/supabase/server";
import { GET } from "@/app/api/events/[id]/dashboard/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Chainable + thenable mock that simulates a Supabase query builder. */
function mockQuery(data: unknown, error: unknown = null) {
  const result = { data, error };
  const obj: Record<string, unknown> = {};
  obj.select = vi.fn().mockReturnValue(obj);
  obj.eq = vi.fn().mockReturnValue(obj);
  obj.in = vi.fn().mockReturnValue(obj);
  obj.contains = vi.fn().mockReturnValue(obj);
  obj.single = vi.fn().mockResolvedValue(result);
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });
const dummyReq = new Request("http://localhost:3000/api/events/evt-1/dashboard");

const GROUP_1 = { id: "group-1", name: "Shredders", color: "#FF5733" };

function makeEvent(id: string, groups: typeof GROUP_1[] = []) {
  return {
    id,
    title: "Saturday Ride",
    type: "ride",
    event_groups: groups.map((g) => ({ group_id: g.id, groups: g })),
  };
}

function makeProfile(
  id: string,
  name: string,
  roles: string[] = ["roll_model"],
) {
  return {
    id,
    full_name: name,
    avatar_url: null,
    medical_alerts: null,
    media_opt_out: false,
    roles,
    rider_group_id: null,
  };
}

function makeRsvp(
  eventId: string,
  userId: string,
  status: string,
  opts: { rider_id?: string; assigned_group_id?: string | null } = {},
) {
  return {
    id: `rsvp-${userId}`,
    event_id: eventId,
    user_id: userId,
    rider_id: opts.rider_id ?? null,
    status,
    assigned_group_id: opts.assigned_group_id ?? null,
    responded_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/events/[id]/dashboard", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = {
      auth: { getUser: vi.fn() },
      from: vi.fn(),
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);
  });

  // -------------------------------------------------------------------------
  // Auth / error cases
  // -------------------------------------------------------------------------

  it("returns 401 when not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await GET(dummyReq, makeParams("evt-1"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when event is not found", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u-1" } },
    });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "events") return mockQuery(null, { message: "Not found" });
      return mockQuery([]);
    });

    const res = await GET(dummyReq, makeParams("evt-1"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Event not found" });
  });

  // -------------------------------------------------------------------------
  // Phase 2 — event WITH groups
  // -------------------------------------------------------------------------

  describe("Phase 2 — event with groups", () => {
    const eventId = "evt-1";

    /**
     * Wire up the mock Supabase client for a Phase 2 scenario.
     *
     * `from("profiles")` is potentially called twice in Phase 2:
     *   1. Adult riders query (.contains("roles", ["rider"]))
     *   2. Supplemental roll-model query (only when there are self-RSVPed
     *      users not already in roll_model_groups)
     *
     * The counter distinguishes between the two calls.
     */
    function setupPhase2({
      rsvps = [] as ReturnType<typeof makeRsvp>[],
      rmGroupProfiles = [] as { roll_model_id: string; profiles: unknown }[],
      minorRiders = [] as unknown[],
      adultRiders = [] as unknown[],
      additionalProfiles = [] as unknown[],
    } = {}) {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "u-admin" } },
      });

      let profilesCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "events") {
          return mockQuery(makeEvent(eventId, [GROUP_1]));
        }
        if (table === "rsvps") {
          return mockQuery(rsvps);
        }
        if (table === "roll_model_groups") {
          return mockQuery(rmGroupProfiles);
        }
        if (table === "riders") {
          return mockQuery(minorRiders);
        }
        if (table === "profiles") {
          profilesCallCount++;
          // First call: adult riders; second call: supplemental RM profiles
          return profilesCallCount === 1
            ? mockQuery(adultRiders)
            : mockQuery(additionalProfiles);
        }
        return mockQuery([]);
      });
    }

    function rmGroupRow(profile: ReturnType<typeof makeProfile>) {
      return {
        roll_model_id: profile.id,
        profiles: {
          id: profile.id,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          medical_alerts: profile.medical_alerts,
          media_opt_out: profile.media_opt_out,
        },
      };
    }

    it("shows roll model from roll_model_groups who RSVPed yes", async () => {
      const rm = makeProfile("rm-1", "Coach Alice");
      setupPhase2({
        rsvps: [
          makeRsvp(eventId, "rm-1", "yes", {
            assigned_group_id: GROUP_1.id,
          }),
        ],
        rmGroupProfiles: [rmGroupRow(rm)],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.roll_models.confirmed).toHaveLength(1);
      expect(body.roll_models.confirmed[0]).toMatchObject({
        id: "rm-1",
        full_name: "Coach Alice",
        assigned_group_id: GROUP_1.id,
        assigned_group_name: "Shredders",
      });
      expect(body.counts.confirmed_roll_models).toBe(1);
    });

    it("includes roll model who RSVPed but is NOT in roll_model_groups (bug fix)", async () => {
      // Core regression test for the bug: user RSVPed before getting the
      // roll_model role added and/or before being assigned to the event's
      // groups via roll_model_groups.
      const rm = makeProfile("rm-2", "Coach Bob");
      setupPhase2({
        rsvps: [makeRsvp(eventId, "rm-2", "yes")],
        rmGroupProfiles: [], // NOT in roll_model_groups
        additionalProfiles: [rm],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.roll_models.confirmed).toHaveLength(1);
      expect(body.roll_models.confirmed[0]).toMatchObject({
        id: "rm-2",
        full_name: "Coach Bob",
        assigned_group_id: null,
      });
      expect(body.counts.total_roll_models).toBe(1);
      expect(body.counts.confirmed_roll_models).toBe(1);
    });

    it("includes admin who RSVPed but is NOT in roll_model_groups", async () => {
      const admin = makeProfile("admin-1", "Admin Carol", ["admin"]);
      setupPhase2({
        rsvps: [makeRsvp(eventId, "admin-1", "yes")],
        rmGroupProfiles: [],
        additionalProfiles: [admin],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.confirmed).toHaveLength(1);
      expect(body.roll_models.confirmed[0]).toMatchObject({
        id: "admin-1",
        full_name: "Admin Carol",
      });
    });

    it("includes super_admin who RSVPed but is NOT in roll_model_groups", async () => {
      const sa = makeProfile("sa-1", "Super Admin Eve", ["super_admin"]);
      setupPhase2({
        rsvps: [makeRsvp(eventId, "sa-1", "maybe")],
        rmGroupProfiles: [],
        additionalProfiles: [sa],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.maybe).toHaveLength(1);
      expect(body.roll_models.maybe[0].id).toBe("sa-1");
    });

    it("does NOT include parent-only user who RSVPed in roll models", async () => {
      const parent = makeProfile("parent-1", "Parent Dave", ["parent"]);
      setupPhase2({
        rsvps: [makeRsvp(eventId, "parent-1", "yes")],
        rmGroupProfiles: [],
        additionalProfiles: [parent],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.confirmed).toHaveLength(0);
      expect(body.counts.total_roll_models).toBe(0);
    });

    it("does not duplicate roll models already in roll_model_groups", async () => {
      const rm = makeProfile("rm-1", "Coach Alice");
      setupPhase2({
        rsvps: [
          makeRsvp(eventId, "rm-1", "yes", {
            assigned_group_id: GROUP_1.id,
          }),
        ],
        rmGroupProfiles: [rmGroupRow(rm)],
        // rm-1 is already in rmMap so supplemental query skips them
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.confirmed).toHaveLength(1);
      expect(body.counts.total_roll_models).toBe(1);
    });

    it("combines roll models from roll_model_groups AND supplemental query", async () => {
      const rmInGroup = makeProfile("rm-1", "Coach Alice");
      const rmNotInGroup = makeProfile("rm-2", "Coach Bob");

      setupPhase2({
        rsvps: [
          makeRsvp(eventId, "rm-1", "yes", {
            assigned_group_id: GROUP_1.id,
          }),
          makeRsvp(eventId, "rm-2", "maybe"),
        ],
        rmGroupProfiles: [rmGroupRow(rmInGroup)],
        additionalProfiles: [rmNotInGroup],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.confirmed).toHaveLength(1);
      expect(body.roll_models.confirmed[0].id).toBe("rm-1");
      expect(body.roll_models.maybe).toHaveLength(1);
      expect(body.roll_models.maybe[0].id).toBe("rm-2");
      expect(body.counts.total_roll_models).toBe(2);
      expect(body.counts.confirmed_roll_models).toBe(1);
    });

    it("categorises roll model RSVP statuses correctly", async () => {
      const rm1 = makeProfile("rm-1", "Coach Alice");
      const rm2 = makeProfile("rm-2", "Coach Bob");
      const rm3 = makeProfile("rm-3", "Coach Eve");
      const rm4 = makeProfile("rm-4", "Coach Frank");

      setupPhase2({
        rsvps: [
          makeRsvp(eventId, "rm-1", "yes", {
            assigned_group_id: GROUP_1.id,
          }),
          makeRsvp(eventId, "rm-2", "maybe"),
          makeRsvp(eventId, "rm-3", "no"),
          // rm-4 has NOT RSVPed
        ],
        rmGroupProfiles: [rmGroupRow(rm1), rmGroupRow(rm4)],
        additionalProfiles: [rm2, rm3],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.confirmed).toHaveLength(1);
      expect(body.roll_models.confirmed[0].id).toBe("rm-1");

      expect(body.roll_models.maybe).toHaveLength(1);
      expect(body.roll_models.maybe[0].id).toBe("rm-2");

      expect(body.roll_models.no).toHaveLength(1);
      expect(body.roll_models.no[0].id).toBe("rm-3");

      expect(body.roll_models.not_responded).toHaveLength(1);
      expect(body.roll_models.not_responded[0].id).toBe("rm-4");

      expect(body.counts.total_roll_models).toBe(4);
    });

    it("tracks confirmed_unassigned roll models", async () => {
      const rm = makeProfile("rm-2", "Coach Bob");
      setupPhase2({
        rsvps: [makeRsvp(eventId, "rm-2", "yes")], // no assigned_group_id
        rmGroupProfiles: [],
        additionalProfiles: [rm],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.confirmed_unassigned).toHaveLength(1);
      expect(body.roll_models.confirmed_unassigned[0].id).toBe("rm-2");
    });
  });

  // -------------------------------------------------------------------------
  // Phase 1 — event WITHOUT groups
  // -------------------------------------------------------------------------

  describe("Phase 1 — event without groups", () => {
    const eventId = "evt-2";

    function setupPhase1({
      rsvps = [] as ReturnType<typeof makeRsvp>[],
      selfProfiles = [] as unknown[],
      minorRiders = [] as unknown[],
      groups = [] as unknown[],
    } = {}) {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "u-admin" } },
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "events") {
          return mockQuery(makeEvent(eventId, []));
        }
        if (table === "rsvps") {
          return mockQuery(rsvps);
        }
        if (table === "profiles") {
          return mockQuery(selfProfiles);
        }
        if (table === "riders") {
          return mockQuery(minorRiders);
        }
        if (table === "groups") {
          return mockQuery(groups);
        }
        return mockQuery([]);
      });
    }

    it("shows roll model who RSVPed yes", async () => {
      const rm = makeProfile("rm-1", "Coach Alice");
      setupPhase1({
        rsvps: [makeRsvp(eventId, "rm-1", "yes")],
        selfProfiles: [rm],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.confirmed).toHaveLength(1);
      expect(body.roll_models.confirmed[0]).toMatchObject({
        id: "rm-1",
        full_name: "Coach Alice",
      });
      expect(body.counts.total_roll_models).toBe(1);
    });

    it("returns empty lists when there are no RSVPs", async () => {
      setupPhase1({ rsvps: [] });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.confirmed).toHaveLength(0);
      expect(body.roll_models.maybe).toHaveLength(0);
      expect(body.roll_models.no).toHaveLength(0);
      expect(body.roll_models.not_responded).toHaveLength(0);
      expect(body.riders_by_group).toHaveLength(0);
      expect(body.counts.total_roll_models).toBe(0);
      expect(body.ratio).toBeNull();
    });

    it("separates roll models from riders", async () => {
      const rm = makeProfile("rm-1", "Coach Alice");
      const rider = makeProfile("rider-1", "Rider Zara", ["rider"]);
      rider.rider_group_id = "g-1" as unknown as null;

      setupPhase1({
        rsvps: [
          makeRsvp(eventId, "rm-1", "yes"),
          makeRsvp(eventId, "rider-1", "yes"),
        ],
        selfProfiles: [rm, rider],
        groups: [{ id: "g-1", name: "Trail Blazers", color: "#123456" }],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.confirmed).toHaveLength(1);
      expect(body.roll_models.confirmed[0].id).toBe("rm-1");
      expect(body.riders_by_group).toHaveLength(1);
      expect(body.riders_by_group[0].confirmed).toHaveLength(1);
      expect(body.riders_by_group[0].confirmed[0].id).toBe("rider-1");
    });
  });
});
