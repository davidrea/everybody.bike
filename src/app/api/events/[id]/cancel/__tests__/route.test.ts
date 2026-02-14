import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/push-server", () => ({
  sendWebPushNotification: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  isEmailConfigured: vi.fn(() => true),
  sendEmail: vi.fn(),
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
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { POST } from "@/app/api/events/[id]/cancel/route";

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
  obj.single = vi.fn().mockResolvedValue(result);
  obj.maybeSingle = vi.fn().mockResolvedValue(result);
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

describe("POST /api/events/[id]/cancel", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSupabase: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockAdmin: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      auth: { getUser: vi.fn() },
      from: vi.fn(),
    };

    mockAdmin = {
      from: vi.fn(),
    };

    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdmin);
  });

  it("includes admin and super_admin users in cancellation emails for grouped events", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-actor" } },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return mockQuery({ roles: ["admin"] });
      }
      return mockQuery(null);
    });

    let profilesCallCount = 0;
    let eventsCallCount = 0;

    mockAdmin.from.mockImplementation((table: string) => {
      if (table === "events") {
        eventsCallCount += 1;
        if (eventsCallCount === 1) {
          return mockQuery({
            id: "evt-1",
            title: "Saturday Ride",
            starts_at: "2026-03-01T16:00:00.000Z",
            location: "Trailhead",
            canceled_at: null,
          });
        }
        return mockQuery(null);
      }

      if (table === "event_groups") {
        return mockQuery([{ group_id: "group-1" }]);
      }

      if (table === "rider_parents") {
        return mockQuery([{ parent_id: "parent-1" }]);
      }

      if (table === "notification_preferences") {
        return mockQuery([]);
      }

      if (table === "push_subscriptions") {
        return mockQuery([]);
      }

      if (table === "scheduled_notifications") {
        return mockQuery(null);
      }

      if (table === "profiles") {
        profilesCallCount += 1;

        // 1) Group adult audience (adult riders in event groups)
        if (profilesCallCount === 1) {
          return mockQuery([{ id: "adult-rider-1" }]);
        }

        // 2) Admin audience (admin/super_admin regardless of group)
        if (profilesCallCount === 2) {
          return mockQuery([{ id: "admin-only-1" }, { id: "super-admin-only-1" }]);
        }

        // 3) Accepted profile filter
        if (profilesCallCount === 3) {
          return mockQuery([
            { id: "adult-rider-1" },
            { id: "parent-1" },
            { id: "admin-only-1" },
            { id: "super-admin-only-1" },
          ]);
        }

        // 4) Email lookups
        return mockQuery([
          { id: "adult-rider-1", email: "adult-rider@example.test" },
          { id: "parent-1", email: "parent@example.test" },
          { id: "admin-only-1", email: "admin-only@example.test" },
          { id: "super-admin-only-1", email: "super-admin-only@example.test" },
        ]);
      }

      return mockQuery(null);
    });

    const res = await POST(
      new Request("http://localhost:3000/api/events/evt-1/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Air quality alert" }),
      }),
      { params: Promise.resolve({ id: "evt-1" }) },
    );

    expect(res.status).toBe(200);

    const recipients = (sendEmail as ReturnType<typeof vi.fn>).mock.calls.map(
      (args) => (args[0] as { to: string }).to,
    );

    expect(recipients).toContain("admin-only@example.test");
    expect(recipients).toContain("super-admin-only@example.test");
    expect(recipients).toContain("adult-rider@example.test");
    expect(recipients).toContain("parent@example.test");
    expect(recipients).toHaveLength(4);
  });
});
