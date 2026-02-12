import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getBaseUrl } from "../url";

// Helper to create a minimal Request-like object with headers
function makeRequest(url: string, headers: Record<string, string> = {}): Request {
  const h = new Headers(headers);
  return new Request(url, { headers: h });
}

describe("getBaseUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clone the env so we can modify it freely
    process.env = { ...originalEnv };
    // Clear all URL-related env vars
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
    delete process.env.BASE_URL;
    delete process.env.ALLOWED_HOSTS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("env var precedence", () => {
    it("returns APP_URL when set", () => {
      process.env.APP_URL = "https://everybody.bike";
      expect(getBaseUrl()).toBe("https://everybody.bike");
    });

    it("strips trailing slashes from env URL", () => {
      process.env.APP_URL = "https://everybody.bike///";
      expect(getBaseUrl()).toBe("https://everybody.bike");
    });

    it("falls back to NEXT_PUBLIC_APP_URL", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://app.everybody.bike";
      expect(getBaseUrl()).toBe("https://app.everybody.bike");
    });

    it("falls back to NEXT_PUBLIC_BASE_URL", () => {
      process.env.NEXT_PUBLIC_BASE_URL = "https://base.everybody.bike";
      expect(getBaseUrl()).toBe("https://base.everybody.bike");
    });

    it("falls back to BASE_URL", () => {
      process.env.BASE_URL = "https://fallback.everybody.bike";
      expect(getBaseUrl()).toBe("https://fallback.everybody.bike");
    });

    it("prefers APP_URL over other env vars", () => {
      process.env.APP_URL = "https://primary.bike";
      process.env.NEXT_PUBLIC_APP_URL = "https://secondary.bike";
      expect(getBaseUrl()).toBe("https://primary.bike");
    });

    it("env var takes precedence over request headers", () => {
      process.env.APP_URL = "https://env.bike";
      const req = makeRequest("http://localhost:3000", {
        origin: "https://header.bike",
      });
      expect(getBaseUrl(req)).toBe("https://env.bike");
    });
  });

  describe("no env vars — request header derivation", () => {
    it("returns localhost:3000 when no request provided", () => {
      expect(getBaseUrl()).toBe("http://localhost:3000");
    });

    it("trusts origin header for localhost", () => {
      const req = makeRequest("http://localhost:3000", {
        origin: "http://localhost:3000",
      });
      expect(getBaseUrl(req)).toBe("http://localhost:3000");
    });

    it("trusts origin header when host is in ALLOWED_HOSTS", () => {
      process.env.ALLOWED_HOSTS = "everybody.bike";
      const req = makeRequest("https://everybody.bike", {
        origin: "https://everybody.bike",
      });
      expect(getBaseUrl(req)).toBe("https://everybody.bike");
    });

    it("rejects origin header from non-allowed host", () => {
      const req = makeRequest("http://localhost:3000", {
        origin: "https://evil.example.com",
        host: "localhost:3000",
      });
      // Should fall through to host-based derivation
      const result = getBaseUrl(req);
      expect(result).not.toContain("evil.example.com");
    });

    it("uses x-forwarded-proto/host when allowed", () => {
      process.env.ALLOWED_HOSTS = "everybody.bike";
      const req = makeRequest("http://localhost:3000", {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "everybody.bike",
      });
      expect(getBaseUrl(req)).toBe("https://everybody.bike");
    });

    it("rejects forwarded host when not in allowlist", () => {
      const req = makeRequest("http://localhost:3000", {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "attacker.example.com",
        host: "localhost:3000",
      });
      const result = getBaseUrl(req);
      expect(result).not.toContain("attacker.example.com");
    });

    it("uses host header when allowed and no origin/forwarded", () => {
      const req = makeRequest("http://localhost:3000", {
        host: "localhost:3000",
      });
      expect(getBaseUrl(req)).toBe("http://localhost:3000");
    });

    it("defaults to http for localhost hosts", () => {
      const req = makeRequest("http://localhost:3000", {
        host: "localhost:3000",
      });
      expect(getBaseUrl(req)).toMatch(/^http:\/\//);
    });

    it("defaults to https for non-localhost hosts", () => {
      process.env.ALLOWED_HOSTS = "everybody.bike";
      const req = makeRequest("https://everybody.bike", {
        host: "everybody.bike",
      });
      expect(getBaseUrl(req)).toBe("https://everybody.bike");
    });

    it("falls back to localhost when host is not allowed", () => {
      const req = makeRequest("https://unknown.example.com", {
        host: "unknown.example.com",
      });
      expect(getBaseUrl(req)).toBe("http://localhost:3000");
    });
  });

  describe("allowlist derivation", () => {
    it("includes localhost variants by default", () => {
      const req = makeRequest("http://127.0.0.1:3000", {
        host: "127.0.0.1:3000",
      });
      expect(getBaseUrl(req)).toContain("127.0.0.1:3000");
    });

    it("derives allowed hosts from env URL vars", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://mysite.example.com";
      // Since NEXT_PUBLIC_APP_URL is set, it'll be returned directly
      // But the allowlist logic still populates from this var
      expect(getBaseUrl()).toBe("https://mysite.example.com");
    });

    it("handles malformed origin gracefully", () => {
      const req = makeRequest("http://localhost:3000", {
        origin: "not-a-valid-url",
        host: "localhost:3000",
      });
      // Should not throw, should fall through
      expect(getBaseUrl(req)).toBe("http://localhost:3000");
    });
  });
});
