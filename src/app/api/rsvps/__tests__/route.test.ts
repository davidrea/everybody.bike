import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { GET, POST, DELETE } from "@/app/api/rsvps/route";

// Valid UUIDs for test data (looseUuid validation in rsvpSchema requires UUID format)
const EVENT_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000002";
const RIDER_ID = "00000000-0000-0000-0000-000000000003";
const OTHER_USER_ID = "00000000-0000-0000-0000-000000000004";

function mockQuery(data: unknown, error: unknown = null) {
  const result = { data, error };
  const obj: Record<string, unknown> = {};
  obj.select = vi.fn().mockReturnValue(obj);
  obj.eq = vi.fn().mockReturnValue(obj);
  obj.in = vi.fn().mockReturnValue(obj);
  obj.or = vi.fn().mockReturnValue(obj);
  obj.update = vi.fn().mockReturnValue(obj);
  obj.delete = vi.fn().mockReturnValue(obj);
  obj.insert = vi.fn().mockReturnValue(obj);
  obj.is = vi.fn().mockReturnValue(obj);
  obj.not = vi.fn().mockReturnValue(obj);
  obj.overlaps = vi.fn().mockReturnValue(obj);
  obj.contains = vi.fn().mockReturnValue(obj);
  obj.gte = vi.fn().mockReturnValue(obj);
  obj.single = vi.fn().mockResolvedValue(result);
  obj.maybeSingle = vi.fn().mockResolvedValue(result);
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

describe("GET /api/rsvps", () => {
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

  it("returns 401 and warns when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await GET(
      new Request("http://localhost:3000/api/rsvps?event_id=evt-1"),
    );

    expect(res.status).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "GET /api/rsvps" }),
      expect.any(String),
    );
  });

  it("returns 400 and warns when event_id is missing", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
    });

    const res = await GET(new Request("http://localhost:3000/api/rsvps"));

    expect(res.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "GET /api/rsvps" }),
      expect.any(String),
    );
  });
});

describe("POST /api/rsvps", () => {
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

  it("returns 401 and warns when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(
      new Request("http://localhost:3000/api/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: EVENT_ID, status: "yes" }),
      }),
    );

    expect(res.status).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/rsvps" }),
      expect.any(String),
    );
  });

  it("returns 400 and warns when validation fails", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
    });

    const res = await POST(
      new Request("http://localhost:3000/api/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "invalid_status" }), // missing event_id, bad status
      }),
    );

    expect(res.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/rsvps" }),
      expect.any(String),
    );
  });

  it("returns 404 and warns when profile not found", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return mockQuery(null); // no profile
      return mockQuery(null);
    });

    const res = await POST(
      new Request("http://localhost:3000/api/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: EVENT_ID, status: "yes" }),
      }),
    );

    expect(res.status).toBe(404);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/rsvps" }),
      expect.any(String),
    );
  });

  it("returns 404 and warns when event not found", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return mockQuery({ roles: ["roll_model"] });
      if (table === "events") return mockQuery(null); // no event
      return mockQuery(null);
    });

    const res = await POST(
      new Request("http://localhost:3000/api/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: EVENT_ID, status: "yes" }),
      }),
    );

    expect(res.status).toBe(404);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/rsvps" }),
      expect.any(String),
    );
  });

  it("returns 400 and warns when event is canceled", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return mockQuery({ roles: ["roll_model"] });
      if (table === "events")
        return mockQuery({
          id: EVENT_ID,
          rsvp_deadline: null,
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          canceled_at: new Date().toISOString(),
          event_groups: [],
        });
      return mockQuery(null);
    });

    const res = await POST(
      new Request("http://localhost:3000/api/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: EVENT_ID, status: "yes" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/rsvps" }),
      expect.any(String),
    );
  });

  it("returns 400 and warns when RSVP deadline has passed (non-admin)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return mockQuery({ roles: ["roll_model"] });
      if (table === "events")
        return mockQuery({
          id: EVENT_ID,
          rsvp_deadline: new Date(Date.now() - 86400000).toISOString(), // yesterday
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          canceled_at: null,
          event_groups: [],
        });
      return mockQuery(null);
    });

    const res = await POST(
      new Request("http://localhost:3000/api/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: EVENT_ID, status: "yes" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/rsvps" }),
      expect.any(String),
    );
  });

  it("returns 403 and warns when non-admin uses on_behalf_of", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return mockQuery({ roles: ["roll_model"] });
      if (table === "events")
        return mockQuery({
          id: EVENT_ID,
          rsvp_deadline: null,
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          canceled_at: null,
          event_groups: [{ group_id: "group-1" }],
        });
      return mockQuery(null);
    });

    const res = await POST(
      new Request("http://localhost:3000/api/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: EVENT_ID,
          status: "yes",
          on_behalf_of: OTHER_USER_ID,
        }),
      }),
    );

    expect(res.status).toBe(403);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/rsvps" }),
      expect.any(String),
    );
  });

  it("returns 403 and warns when rider_id provided but user is not a parent", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return mockQuery({ roles: ["roll_model"] }); // not a parent
      if (table === "events")
        return mockQuery({
          id: EVENT_ID,
          rsvp_deadline: null,
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          canceled_at: null,
          event_groups: [{ group_id: "group-1" }],
        });
      return mockQuery(null);
    });

    const res = await POST(
      new Request("http://localhost:3000/api/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: EVENT_ID,
          status: "yes",
          rider_id: RIDER_ID,
        }),
      }),
    );

    expect(res.status).toBe(403);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/rsvps" }),
      expect.any(String),
    );
  });

  it("returns 403 and warns when parent is not linked to rider", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
    });

    let profilesCallCount = 0;

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        profilesCallCount += 1;
        return mockQuery({ roles: ["parent"] });
      }
      if (table === "events")
        return mockQuery({
          id: EVENT_ID,
          rsvp_deadline: null,
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          canceled_at: null,
          event_groups: [{ group_id: "group-1" }],
        });
      if (table === "rider_parents") return mockQuery(null); // no link
      return mockQuery(null);
    });

    const res = await POST(
      new Request("http://localhost:3000/api/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: EVENT_ID,
          status: "yes",
          rider_id: RIDER_ID,
        }),
      }),
    );

    expect(res.status).toBe(403);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/rsvps" }),
      expect.any(String),
    );
  });

  it("returns 403 and warns when canSelfRsvp is false", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return mockQuery({ roles: ["parent"] }); // parent only, no roll_model/rider/admin
      if (table === "events")
        return mockQuery({
          id: EVENT_ID,
          rsvp_deadline: null,
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          canceled_at: null,
          event_groups: [{ group_id: "group-1" }],
        });
      return mockQuery(null);
    });

    const res = await POST(
      new Request("http://localhost:3000/api/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: EVENT_ID, status: "yes" }),
      }),
    );

    expect(res.status).toBe(403);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/rsvps" }),
      expect.any(String),
    );
  });
});

describe("DELETE /api/rsvps", () => {
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

  it("returns 401 and warns when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await DELETE(
      new Request("http://localhost:3000/api/rsvps", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: EVENT_ID }),
      }),
    );

    expect(res.status).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "DELETE /api/rsvps" }),
      expect.any(String),
    );
  });

  it("returns 400 and warns when event is canceled", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "events")
        return mockQuery({
          id: EVENT_ID,
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          canceled_at: new Date().toISOString(),
        });
      return mockQuery(null);
    });

    const res = await DELETE(
      new Request("http://localhost:3000/api/rsvps", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: EVENT_ID }),
      }),
    );

    expect(res.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "DELETE /api/rsvps" }),
      expect.any(String),
    );
  });

  it("returns 403 and warns when non-admin uses on_behalf_of", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "events")
        return mockQuery({
          id: EVENT_ID,
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          canceled_at: null,
        });
      if (table === "profiles") return mockQuery({ roles: ["roll_model"] }); // not admin
      return mockQuery(null);
    });

    const res = await DELETE(
      new Request("http://localhost:3000/api/rsvps", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: EVENT_ID, on_behalf_of: OTHER_USER_ID }),
      }),
    );

    expect(res.status).toBe(403);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "DELETE /api/rsvps" }),
      expect.any(String),
    );
  });
});
