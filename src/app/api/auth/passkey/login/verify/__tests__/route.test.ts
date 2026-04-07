import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted ensures these are available in the hoisted vi.mock factory calls
const { mockCheck, mockCookieStore, mockHeaderStore, mockVerifyOtp } = vi.hoisted(() => ({
  mockCheck: vi.fn(() => true),
  mockCookieStore: {
    get: vi.fn(),
    getAll: vi.fn(() => [] as { name: string; value: string }[]),
    set: vi.fn(),
    delete: vi.fn(),
  },
  mockHeaderStore: {
    get: vi.fn(),
  },
  mockVerifyOtp: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/passkey", () => ({
  getRpIDFromHeaders: vi.fn(() => "localhost"),
  getOriginFromHeaders: vi.fn(() => "http://localhost:3000"),
}));

vi.mock("@simplewebauthn/server", () => ({
  verifyAuthenticationResponse: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: vi.fn(() => ({ check: mockCheck })),
  getClientIp: vi.fn(() => "1.2.3.4"),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
  headers: vi.fn(async () => mockHeaderStore),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { verifyOtp: mockVerifyOtp },
  })),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { logger } from "@/lib/logger";
import { POST } from "@/app/api/auth/passkey/login/verify/route";

function makeRequest(body: unknown = {}) {
  return new Request("http://localhost:3000/api/auth/passkey/login/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/passkey/login/verify", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockAdmin: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: rate limiter passes
    mockCheck.mockReturnValue(true);

    // Default: no challenge cookie
    mockCookieStore.get.mockReturnValue(undefined);
    mockCookieStore.getAll.mockReturnValue([]);

    // Default: verifyOtp succeeds
    mockVerifyOtp.mockResolvedValue({ error: null });

    mockAdmin = {
      from: vi.fn(),
      auth: {
        admin: {
          getUserById: vi.fn(),
          generateLink: vi.fn(),
        },
      },
    };

    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockAdmin);
  });

  it("returns 429 and warns when rate limited", async () => {
    mockCheck.mockReturnValue(false);

    const res = await POST(makeRequest({ id: "cred-1" }));

    expect(res.status).toBe(429);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/auth/passkey/login/verify" }),
      expect.any(String),
    );
  });

  it("returns 400 and warns when no challenge cookie", async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    const res = await POST(makeRequest({ id: "cred-1" }));

    expect(res.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/auth/passkey/login/verify" }),
      expect.any(String),
    );
  });

  it("returns 400 and warns when no credential ID in body", async () => {
    mockCookieStore.get.mockReturnValue({ value: "challenge-abc" });

    const res = await POST(makeRequest({})); // no `id` field

    expect(res.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/auth/passkey/login/verify" }),
      expect.any(String),
    );
  });

  it("returns 400 and warns when credential not found in DB", async () => {
    mockCookieStore.get.mockReturnValue({ value: "challenge-abc" });

    mockAdmin.from.mockImplementation(() => {
      const obj: Record<string, unknown> = {};
      obj.select = vi.fn().mockReturnValue(obj);
      obj.eq = vi.fn().mockReturnValue(obj);
      obj.single = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
      return obj;
    });

    const res = await POST(makeRequest({ id: "cred-missing" }));

    expect(res.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/auth/passkey/login/verify" }),
      expect.any(String),
    );
  });

  it("returns 400 and warns when verification fails", async () => {
    mockCookieStore.get.mockReturnValue({ value: "challenge-abc" });

    const fakeCredential = {
      id: "cred-1",
      public_key: "\\x" + Buffer.from("fakepubkey").toString("hex"),
      counter: 0,
      transports: [],
      user_id: "user-1",
    };

    mockAdmin.from.mockImplementation(() => {
      const obj: Record<string, unknown> = {};
      obj.select = vi.fn().mockReturnValue(obj);
      obj.eq = vi.fn().mockReturnValue(obj);
      obj.update = vi.fn().mockReturnValue(obj);
      obj.single = vi.fn().mockResolvedValue({ data: fakeCredential, error: null });
      obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve, reject);
      return obj;
    });

    (verifyAuthenticationResponse as ReturnType<typeof vi.fn>).mockResolvedValue({
      verified: false,
    });

    const res = await POST(makeRequest({ id: "cred-1" }));

    expect(res.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/auth/passkey/login/verify" }),
      expect.any(String),
    );
  });

  it("returns 500 and errors when session link generation fails (linkError)", async () => {
    mockCookieStore.get.mockReturnValue({ value: "challenge-abc" });
    mockCookieStore.getAll.mockReturnValue([]);

    const fakeCredential = {
      id: "cred-1",
      public_key: "\\x" + Buffer.from("fakepubkey").toString("hex"),
      counter: 0,
      transports: [],
      user_id: "user-1",
    };

    let fromCallCount = 0;
    mockAdmin.from.mockImplementation(() => {
      fromCallCount += 1;
      const obj: Record<string, unknown> = {};
      obj.select = vi.fn().mockReturnValue(obj);
      obj.eq = vi.fn().mockReturnValue(obj);
      obj.update = vi.fn().mockReturnValue(obj);
      if (fromCallCount === 1) {
        // credential lookup
        obj.single = vi.fn().mockResolvedValue({ data: fakeCredential, error: null });
      } else {
        // counter update
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
      }
      obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve, reject);
      return obj;
    });

    (verifyAuthenticationResponse as ReturnType<typeof vi.fn>).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    });

    mockAdmin.auth.admin.getUserById.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
      error: null,
    });

    mockAdmin.auth.admin.generateLink.mockResolvedValue({
      data: null,
      error: { message: "link generation failed" },
    });

    const res = await POST(makeRequest({ id: "cred-1" }));

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/auth/passkey/login/verify" }),
      expect.any(String),
    );
  });

  it("returns 500 and errors when verifyOtp fails", async () => {
    mockCookieStore.get.mockReturnValue({ value: "challenge-abc" });
    mockCookieStore.getAll.mockReturnValue([]);

    // Make verifyOtp fail for this test
    mockVerifyOtp.mockResolvedValueOnce({ error: { message: "otp verification failed" } });

    const fakeCredential = {
      id: "cred-1",
      public_key: "\\x" + Buffer.from("fakepubkey").toString("hex"),
      counter: 0,
      transports: [],
      user_id: "user-1",
    };

    let fromCallCount = 0;
    mockAdmin.from.mockImplementation(() => {
      fromCallCount += 1;
      const obj: Record<string, unknown> = {};
      obj.select = vi.fn().mockReturnValue(obj);
      obj.eq = vi.fn().mockReturnValue(obj);
      obj.update = vi.fn().mockReturnValue(obj);
      if (fromCallCount === 1) {
        obj.single = vi.fn().mockResolvedValue({ data: fakeCredential, error: null });
      } else {
        obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
      }
      obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve, reject);
      return obj;
    });

    (verifyAuthenticationResponse as ReturnType<typeof vi.fn>).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    });

    mockAdmin.auth.admin.getUserById.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
      error: null,
    });

    mockAdmin.auth.admin.generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "tok-abc" } },
      error: null,
    });

    const res = await POST(makeRequest({ id: "cred-1" }));

    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ route: "POST /api/auth/passkey/login/verify" }),
      expect.any(String),
    );
  });
});
