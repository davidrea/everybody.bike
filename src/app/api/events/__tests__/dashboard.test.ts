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
  obj.overlaps = vi.fn().mockReturnValue(obj);
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
     * `from("profiles")` is called twice in Phase 2:
     *   1. All RM/admin/super_admin profiles (.overlaps query)
     *   2. Adult riders (.contains("roles", ["rider"]))
     */
    function setupPhase2({
      rsvps = [] as ReturnType<typeof makeRsvp>[],
      allRmProfiles = [] as ReturnType<typeof makeProfile>[],
      minorRiders = [] as unknown[],
      adultRiders = [] as unknown[],
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
        if (table === "riders") {
          return mockQuery(minorRiders);
        }
        if (table === "profiles") {
          profilesCallCount++;
          // First call: all RM profiles; second call: adult riders
          return profilesCallCount === 1
            ? mockQuery(allRmProfiles)
            : mockQuery(adultRiders);
        }
        return mockQuery([]);
      });
    }

    it("shows roll model who RSVPed yes", async () => {
      const rm = makeProfile("rm-1", "Coach Alice");
      setupPhase2({
        rsvps: [
          makeRsvp(eventId, "rm-1", "yes", {
            assigned_group_id: GROUP_1.id,
          }),
        ],
        allRmProfiles: [rm],
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

    it("shows roll model with no RSVP as not_responded", async () => {
      const rm = makeProfile("rm-1", "Coach Alice");
      setupPhase2({
        rsvps: [],
        allRmProfiles: [rm],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.not_responded).toHaveLength(1);
      expect(body.roll_models.not_responded[0]).toMatchObject({
        id: "rm-1",
        full_name: "Coach Alice",
      });
      expect(body.counts.total_roll_models).toBe(1);
      expect(body.counts.confirmed_roll_models).toBe(0);
    });

    it("shows newly-added roll model on existing event as not_responded", async () => {
      // Key regression test: a user gets the roll_model role added after
      // the event was created — they should appear as not_responded.
      const existingRm = makeProfile("rm-1", "Coach Alice");
      const newRm = makeProfile("rm-2", "Coach Bob");
      setupPhase2({
        rsvps: [makeRsvp(eventId, "rm-1", "yes", { assigned_group_id: GROUP_1.id })],
        allRmProfiles: [existingRm, newRm],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.confirmed).toHaveLength(1);
      expect(body.roll_models.confirmed[0].id).toBe("rm-1");
      expect(body.roll_models.not_responded).toHaveLength(1);
      expect(body.roll_models.not_responded[0].id).toBe("rm-2");
      expect(body.counts.total_roll_models).toBe(2);
    });

    it("includes admin in roll model list", async () => {
      const admin = makeProfile("admin-1", "Admin Carol", ["admin"]);
      setupPhase2({
        rsvps: [makeRsvp(eventId, "admin-1", "yes")],
        allRmProfiles: [admin],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.confirmed).toHaveLength(1);
      expect(body.roll_models.confirmed[0]).toMatchObject({
        id: "admin-1",
        full_name: "Admin Carol",
      });
    });

    it("includes super_admin in roll model list", async () => {
      const sa = makeProfile("sa-1", "Super Admin Eve", ["super_admin"]);
      setupPhase2({
        rsvps: [makeRsvp(eventId, "sa-1", "maybe")],
        allRmProfiles: [sa],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.maybe).toHaveLength(1);
      expect(body.roll_models.maybe[0].id).toBe("sa-1");
    });

    it("does NOT include parent-only user in roll models", async () => {
      // Parent-only users are excluded by the overlaps query, so
      // allRmProfiles should not contain them.
      setupPhase2({
        rsvps: [makeRsvp(eventId, "parent-1", "yes")],
        allRmProfiles: [], // parent not returned by overlaps query
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.confirmed).toHaveLength(0);
      expect(body.counts.total_roll_models).toBe(0);
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
        allRmProfiles: [rm1, rm2, rm3, rm4],
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
        allRmProfiles: [rm],
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

    /**
     * Wire up the mock Supabase client for a Phase 1 scenario (no groups).
     *
     * `from("profiles")` is called 1 or 2 times:
     *   1. (If RSVPs exist) RSVP'd user profiles
     *   2. All RM/admin/super_admin profiles (.overlaps query) — always called
     */
    function setupPhase1({
      rsvps = [] as ReturnType<typeof makeRsvp>[],
      selfProfiles = [] as unknown[],
      allRmProfiles = [] as ReturnType<typeof makeProfile>[],
      minorRiders = [] as unknown[],
      groups = [] as unknown[],
    } = {}) {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "u-admin" } },
      });

      const hasSelfRsvps = rsvps.some((r) => !r.rider_id);
      let profilesCallCount = 0;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "events") {
          return mockQuery(makeEvent(eventId, []));
        }
        if (table === "rsvps") {
          return mockQuery(rsvps);
        }
        if (table === "profiles") {
          profilesCallCount++;
          // When there are self-RSVPs, first call returns RSVP'd profiles,
          // second returns all RM profiles. Otherwise only RM profiles.
          if (hasSelfRsvps && profilesCallCount === 1) {
            return mockQuery(selfProfiles);
          }
          return mockQuery(allRmProfiles);
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
        allRmProfiles: [rm],
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

    it("shows roll model with no RSVP as not_responded", async () => {
      const rm = makeProfile("rm-1", "Coach Alice");
      setupPhase1({
        rsvps: [],
        allRmProfiles: [rm],
      });

      const res = await GET(dummyReq, makeParams(eventId));
      const body = await res.json();

      expect(body.roll_models.not_responded).toHaveLength(1);
      expect(body.roll_models.not_responded[0]).toMatchObject({
        id: "rm-1",
        full_name: "Coach Alice",
      });
      expect(body.counts.total_roll_models).toBe(1);
    });

    it("returns empty lists when there are no RSVPs and no roll models", async () => {
      setupPhase1({ rsvps: [], allRmProfiles: [] });

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
        allRmProfiles: [rm],
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
