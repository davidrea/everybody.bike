import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

vi.mock("@/lib/push-server", () => ({
  sendWebPushNotification: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  isEmailConfigured: vi.fn(() => false),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/email-template", () => ({
  renderBrandedEmail: vi.fn(() => ({ html: "<p>msg</p>", text: "msg" })),
}));

vi.mock("@/lib/url", () => ({ getBaseUrl: vi.fn(() => "http://localhost:3000") }));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "../route";

function mockQuery(data: unknown, error: unknown = null) {
  const result = { data, error };
  const obj: Record<string, unknown> = {};
  obj.select = vi.fn().mockReturnValue(obj);
  obj.eq = vi.fn().mockReturnValue(obj);
  obj.lte = vi.fn().mockReturnValue(obj);
  obj.in = vi.fn().mockReturnValue(obj);
  obj.or = vi.fn().mockReturnValue(obj);
  obj.order = vi.fn().mockReturnValue(obj);
  obj.limit = vi.fn().mockResolvedValue(result);
  obj.update = vi.fn().mockReturnValue(obj);
  obj.delete = vi.fn().mockReturnValue(obj);
  obj.insert = vi.fn().mockReturnValue(obj);
  obj.single = vi.fn().mockResolvedValue(result);
  obj.maybeSingle = vi.fn().mockResolvedValue(result);
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

function makeRequest(secret?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret !== undefined) {
    headers["authorization"] = `Bearer ${secret}`;
  }
  return new Request("http://localhost:3000/api/admin/notifications/dispatch", {
    method: "POST",
    headers,
  });
}

describe("POST /api/admin/notifications/dispatch", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockAdmin: any;
  const originalEnv = process.env.NOTIFICATION_DISPATCH_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAdmin = { from: vi.fn() };
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdmin);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NOTIFICATION_DISPATCH_SECRET;
    } else {
      process.env.NOTIFICATION_DISPATCH_SECRET = originalEnv;
    }
  });

  it("returns 500 and logs error when NOTIFICATION_DISPATCH_SECRET is not set", async () => {
    delete process.env.NOTIFICATION_DISPATCH_SECRET;

    const res = await POST(makeRequest("anything"));

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/admin/notifications/dispatch" }),
      "NOTIFICATION_DISPATCH_SECRET is not configured",
    );
  });

  it("returns 401 and logs warn when authorization header is missing", async () => {
    process.env.NOTIFICATION_DISPATCH_SECRET = "test-secret";

    const res = await POST(makeRequest()); // no auth header

    expect(res.status).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/admin/notifications/dispatch" }),
      "Unauthorized request",
    );
  });

  it("returns 401 and logs warn when authorization header has wrong secret", async () => {
    process.env.NOTIFICATION_DISPATCH_SECRET = "test-secret";

    const res = await POST(makeRequest("wrong-secret"));

    expect(res.status).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/admin/notifications/dispatch" }),
      "Unauthorized request",
    );
  });

  it("returns 500 and logs error when DB fetch of scheduled notifications fails", async () => {
    process.env.NOTIFICATION_DISPATCH_SECRET = "test-secret";

    const dbError = new Error("connection timeout");
    mockAdmin.from.mockReturnValue(mockQuery(null, dbError));

    const res = await POST(makeRequest("test-secret"));

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "POST /api/admin/notifications/dispatch",
        err: dbError,
      }),
      "Failed to fetch scheduled notifications",
    );
  });

  it("returns 200 with processed:0 and logs info when no pending notifications", async () => {
    process.env.NOTIFICATION_DISPATCH_SECRET = "test-secret";

    mockAdmin.from.mockReturnValue(mockQuery([]));

    const res = await POST(makeRequest("test-secret"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ processed: 0 });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/admin/notifications/dispatch" }),
      "No pending notifications",
    );
  });

  it("returns 200 and logs info with result summary after processing notifications", async () => {
    process.env.NOTIFICATION_DISPATCH_SECRET = "test-secret";

    const notification = {
      id: "notif-1",
      title: "Test",
      body: "Hello",
      url: null,
      target_type: "all",
      target_id: null,
      category: "custom_message",
      sent: false,
      scheduled_for: new Date(Date.now() - 1000).toISOString(),
    };

    let fromCallCount = 0;
    mockAdmin.from.mockImplementation((table: string) => {
      fromCallCount += 1;

      // First call: fetch scheduled notifications (has .limit)
      if (fromCallCount === 1 && table === "scheduled_notifications") {
        return mockQuery([notification]);
      }

      // profiles for "all" target type
      if (table === "profiles") {
        return mockQuery([{ id: "user-1" }]);
      }

      // notification_preferences
      if (table === "notification_preferences") {
        return mockQuery([]);
      }

      // push_subscriptions
      if (table === "push_subscriptions") {
        return mockQuery([]);
      }

      // update sent=true
      if (table === "scheduled_notifications") {
        return mockQuery(null);
      }

      return mockQuery(null);
    });

    const res = await POST(makeRequest("test-secret"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "POST /api/admin/notifications/dispatch",
        processed: 1,
      }),
      "Dispatch complete",
    );
  });
});
