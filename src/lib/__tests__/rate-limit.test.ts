import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRateLimiter, getClientIp } from "../rate-limit";

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000 });
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-1")).toBe(true);
  });

  it("blocks requests at the limit", () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000 });
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-1")).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-2")).toBe(true);
    expect(limiter.check("ip-1")).toBe(false); // ip-1 is over limit
    expect(limiter.check("ip-2")).toBe(false); // ip-2 is over limit
  });

  it("resets after the window expires", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-1")).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(61_000);

    expect(limiter.check("ip-1")).toBe(true);
  });

  it("uses default options when none provided", () => {
    const limiter = createRateLimiter();
    // Default max is 10
    for (let i = 0; i < 10; i++) {
      expect(limiter.check("key")).toBe(true);
    }
    expect(limiter.check("key")).toBe(false);
  });

  describe("remaining()", () => {
    it("returns max for unknown key", () => {
      const limiter = createRateLimiter({ max: 5, windowMs: 60_000 });
      expect(limiter.remaining("unknown")).toBe(5);
    });

    it("decreases as requests are made", () => {
      const limiter = createRateLimiter({ max: 5, windowMs: 60_000 });
      limiter.check("ip-1");
      expect(limiter.remaining("ip-1")).toBe(4);
      limiter.check("ip-1");
      expect(limiter.remaining("ip-1")).toBe(3);
    });

    it("returns 0 when at limit", () => {
      const limiter = createRateLimiter({ max: 2, windowMs: 60_000 });
      limiter.check("ip-1");
      limiter.check("ip-1");
      expect(limiter.remaining("ip-1")).toBe(0);
    });

    it("restores after window expires", () => {
      const limiter = createRateLimiter({ max: 3, windowMs: 60_000 });
      limiter.check("ip-1");
      limiter.check("ip-1");
      expect(limiter.remaining("ip-1")).toBe(1);

      vi.advanceTimersByTime(61_000);
      expect(limiter.remaining("ip-1")).toBe(3);
    });
  });

  describe("sliding window behavior", () => {
    it("allows requests in a sliding window", () => {
      const limiter = createRateLimiter({ max: 2, windowMs: 60_000 });

      // First request at t=0
      limiter.check("ip-1");

      // Second request at t=30s
      vi.advanceTimersByTime(30_000);
      limiter.check("ip-1");

      // At t=30s, both requests are within the 60s window
      expect(limiter.check("ip-1")).toBe(false);

      // At t=61s, first request has expired
      vi.advanceTimersByTime(31_000);
      expect(limiter.check("ip-1")).toBe(true);
    });
  });
});

describe("getClientIp", () => {
  it("extracts IP from cf-connecting-ip header", () => {
    const req = new Request("http://localhost", {
      headers: {
        "cf-connecting-ip": "1.2.3.4",
        "x-forwarded-for": "5.6.7.8",
      },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-forwarded-for when no cf-connecting-ip", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "5.6.7.8, 10.0.0.1",
      },
    });
    expect(getClientIp(req)).toBe("5.6.7.8");
  });

  it("returns 'unknown' when no IP headers present", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("unknown");
  });

  it("trims whitespace from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "  5.6.7.8  , 10.0.0.1",
      },
    });
    expect(getClientIp(req)).toBe("5.6.7.8");
  });
});
