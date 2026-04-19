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

import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { GET, POST } from "../route";

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
  obj.order = vi.fn().mockReturnValue(obj);
  obj.limit = vi.fn().mockReturnValue(obj);
  obj.single = vi.fn().mockResolvedValue(result);
  obj.maybeSingle = vi.fn().mockResolvedValue(result);
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

describe("GET /api/groups", () => {
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

  it("returns 401 and warns when user is not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const res = await GET();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "GET /api/groups" }),
      expect.any(String),
    );
  });

  it("returns 500 and logs error when DB fetch fails", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const dbError = { message: "connection refused", code: "08000" };
    mockSupabase.from.mockReturnValue(mockQuery(null, dbError));

    const res = await GET();

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ route: "GET /api/groups", err: dbError }),
      expect.any(String),
    );
  });
});

describe("POST /api/groups", () => {
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

  it("returns 401 and warns when user is not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const req = new Request("http://localhost/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Shredders", color: "#ff0000" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/groups" }),
      expect.any(String),
    );
  });

  it("returns 403 and warns when user is not an admin", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return mockQuery({ roles: ["roll_model"] });
      }
      return mockQuery(null);
    });

    const req = new Request("http://localhost/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Shredders", color: "#ff0000" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/groups", userId: "user-1" }),
      expect.any(String),
    );
  });

  it("returns 400 and warns when validation fails", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return mockQuery({ roles: ["admin"] });
      }
      return mockQuery(null);
    });

    const req = new Request("http://localhost/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // missing required "name" field
      body: JSON.stringify({ color: "#ff0000" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/groups", userId: "user-1" }),
      expect.any(String),
    );
  });

  it("returns 409 and warns when group name is a duplicate (DB error code 23505)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const duplicateError = { message: "duplicate key value", code: "23505" };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return mockQuery({ roles: ["admin"] });
      }
      if (table === "groups") {
        return mockQuery(null, duplicateError);
      }
      return mockQuery(null);
    });

    const req = new Request("http://localhost/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Shredders", color: "#ff0000", sort_order: 0 }),
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/groups", userId: "user-1" }),
      expect.any(String),
    );
  });

  it("returns 500 and logs error when a non-duplicate DB error occurs", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const dbError = { message: "connection refused", code: "08000" };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return mockQuery({ roles: ["admin"] });
      }
      if (table === "groups") {
        return mockQuery(null, dbError);
      }
      return mockQuery(null);
    });

    const req = new Request("http://localhost/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Shredders", color: "#ff0000", sort_order: 0 }),
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/groups", userId: "user-1", err: dbError }),
      expect.any(String),
    );
  });

  it("returns 201 and logs info on successful group creation", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const newGroup = { id: "group-abc", name: "Shredders", color: "#ff0000", sort_order: 0 };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return mockQuery({ roles: ["admin"] });
      }
      if (table === "groups") {
        return mockQuery(newGroup, null);
      }
      return mockQuery(null);
    });

    const req = new Request("http://localhost/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Shredders", color: "#ff0000", sort_order: 0 }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("group-abc");
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/groups", userId: "user-1", groupId: "group-abc" }),
      expect.any(String),
    );
  });
});
