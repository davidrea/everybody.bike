import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

// createRateLimiter is called at module import time to create the module-level
// `limiter`. We capture the returned limiter object from the factory so tests
// can reach in and override `check` without running into vi.mock hoisting limits.
let capturedLimiter: { check: ReturnType<typeof vi.fn> } | null = null;
vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: vi.fn(() => {
    capturedLimiter = { check: vi.fn(() => true) };
    return capturedLimiter;
  }),
  getClientIp: vi.fn(() => "1.2.3.4"),
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
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "../route";

function mockQuery(data: unknown, error: unknown = null) {
  const result = { data, error };
  const obj: Record<string, unknown> = {};
  obj.select = vi.fn().mockReturnValue(obj);
  obj.eq = vi.fn().mockReturnValue(obj);
  obj.ilike = vi.fn().mockReturnValue(obj);
  obj.update = vi.fn().mockReturnValue(obj);
  obj.insert = vi.fn().mockReturnValue(obj);
  obj.single = vi.fn().mockResolvedValue(result);
  obj.maybeSingle = vi.fn().mockResolvedValue(result);
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

describe("POST /api/admin/invite", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSupabase: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockAdmin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheck.mockReturnValue(true);

    mockSupabase = {
      auth: { getUser: vi.fn() },
      from: vi.fn(),
    };

    mockAdmin = {
      auth: { admin: { inviteUserByEmail: vi.fn() } },
      from: vi.fn(),
    };

    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdmin);
  });

  function makeRequest(body: unknown) {
    return new Request("http://localhost:3000/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 429 and logs warn when rate limited", async () => {
    mockCheck.mockReturnValue(false);

    const res = await POST(makeRequest({ full_name: "Alice", email: "alice@example.com", roles: ["parent"] }));

    expect(res.status).toBe(429);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/admin/invite" }),
      "Rate limited",
    );
  });

  it("returns 401 and logs warn when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest({ full_name: "Alice", email: "alice@example.com", roles: ["parent"] }));

    expect(res.status).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/admin/invite" }),
      "Unauthenticated",
    );
  });

  it("returns 403 and logs warn when user is not admin", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockSupabase.from.mockReturnValue(mockQuery({ roles: ["parent"] }));

    const res = await POST(makeRequest({ full_name: "Alice", email: "alice@example.com", roles: ["parent"] }));

    expect(res.status).toBe(403);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/admin/invite", userId: "user-1" }),
      "Forbidden: not admin",
    );
  });

  it("returns 400 and logs warn when validation fails", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
    });
    mockSupabase.from.mockReturnValue(mockQuery({ roles: ["admin"] }));

    const res = await POST(makeRequest({ full_name: "", email: "not-an-email", roles: [] }));

    expect(res.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/admin/invite", userId: "admin-1" }),
      "Validation failed",
    );
  });

  it("returns 409 and logs warn when user already exists", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
    });

    let fromCallCount = 0;
    mockSupabase.from.mockImplementation(() => {
      fromCallCount += 1;
      if (fromCallCount === 1) {
        // profiles roles check
        return mockQuery({ roles: ["admin"] });
      }
      // existing user check
      return mockQuery({ id: "existing-user-id", email: "alice@example.com" });
    });

    const res = await POST(makeRequest({ full_name: "Alice", email: "alice@example.com", roles: ["parent"] }));

    expect(res.status).toBe(409);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/admin/invite", userId: "admin-1" }),
      "User already exists",
    );
  });

  it("returns 500 and logs error when invite fails", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
    });

    let fromCallCount = 0;
    mockSupabase.from.mockImplementation(() => {
      fromCallCount += 1;
      if (fromCallCount === 1) return mockQuery({ roles: ["admin"] });
      // no existing user
      return mockQuery(null);
    });

    const inviteError = new Error("SMTP error");
    mockAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: null,
      error: inviteError,
    });

    const res = await POST(makeRequest({ full_name: "Alice", email: "alice@example.com", roles: ["parent"] }));

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "POST /api/admin/invite",
        userId: "admin-1",
        err: inviteError,
      }),
      "Failed to invite user",
    );
  });

  it("returns 500 and logs error when invite succeeds but no user ID returned", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
    });

    let fromCallCount = 0;
    mockSupabase.from.mockImplementation(() => {
      fromCallCount += 1;
      if (fromCallCount === 1) return mockQuery({ roles: ["admin"] });
      return mockQuery(null);
    });

    mockAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const res = await POST(makeRequest({ full_name: "Alice", email: "alice@example.com", roles: ["parent"] }));

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "POST /api/admin/invite",
        userId: "admin-1",
      }),
      "Invite sent but no user ID returned",
    );
  });

  it("returns 500 and logs error when profile update fails", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
    });

    let fromCallCount = 0;
    mockSupabase.from.mockImplementation(() => {
      fromCallCount += 1;
      if (fromCallCount === 1) return mockQuery({ roles: ["admin"] });
      return mockQuery(null);
    });

    mockAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: "new-user-id" } },
      error: null,
    });

    const profileError = new Error("DB write failed");
    const adminFromObj: Record<string, unknown> = {};
    adminFromObj.update = vi.fn().mockReturnValue(adminFromObj);
    adminFromObj.eq = vi.fn().mockResolvedValue({ data: null, error: profileError });
    mockAdmin.from = vi.fn().mockReturnValue(adminFromObj);

    const res = await POST(makeRequest({ full_name: "Alice", email: "alice@example.com", roles: ["parent"] }));

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "POST /api/admin/invite",
        userId: "admin-1",
        invitedUserId: "new-user-id",
        err: profileError,
      }),
      "Failed to update invited user profile",
    );
  });

  it("returns 201 and logs info on success", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
    });

    let fromCallCount = 0;
    mockSupabase.from.mockImplementation(() => {
      fromCallCount += 1;
      if (fromCallCount === 1) return mockQuery({ roles: ["admin"] });
      return mockQuery(null);
    });

    mockAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: "new-user-id" } },
      error: null,
    });

    const adminFromObj: Record<string, unknown> = {};
    adminFromObj.update = vi.fn().mockReturnValue(adminFromObj);
    adminFromObj.eq = vi.fn().mockResolvedValue({ data: null, error: null });
    mockAdmin.from = vi.fn().mockReturnValue(adminFromObj);

    const res = await POST(makeRequest({ full_name: "Alice", email: "alice@example.com", roles: ["parent"] }));

    expect(res.status).toBe(201);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "POST /api/admin/invite",
        userId: "admin-1",
        invitedUserId: "new-user-id",
      }),
      "User invited",
    );
  });
});
