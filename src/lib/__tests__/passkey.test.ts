import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getRpIDFromHeaders, getOriginFromHeaders } from "../passkey";

function makeHeaders(entries: Record<string, string> = {}): Headers {
  return new Headers(entries);
}

describe("getRpIDFromHeaders", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns env RP ID when set", () => {
    process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID = "everybody.bike";
    const headers = makeHeaders({ host: "different.host.com" });
    expect(getRpIDFromHeaders(headers)).toBe("everybody.bike");
  });

  it("ignores env when set to 'auto'", () => {
    process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID = "auto";
    const headers = makeHeaders({ host: "everybody.bike:3000" });
    expect(getRpIDFromHeaders(headers)).toBe("everybody.bike");
  });

  it("derives RP ID from x-forwarded-host (strips port)", () => {
    const headers = makeHeaders({ "x-forwarded-host": "everybody.bike:443" });
    expect(getRpIDFromHeaders(headers)).toBe("everybody.bike");
  });

  it("derives RP ID from host header when no forwarded", () => {
    const headers = makeHeaders({ host: "everybody.bike" });
    expect(getRpIDFromHeaders(headers)).toBe("everybody.bike");
  });

  it("strips port from host header", () => {
    const headers = makeHeaders({ host: "localhost:3000" });
    expect(getRpIDFromHeaders(headers)).toBe("localhost");
  });

  it("prefers x-forwarded-host over host", () => {
    const headers = makeHeaders({
      "x-forwarded-host": "everybody.bike",
      host: "localhost:3000",
    });
    expect(getRpIDFromHeaders(headers)).toBe("everybody.bike");
  });

  it("returns 'localhost' when no headers present", () => {
    const headers = makeHeaders({});
    expect(getRpIDFromHeaders(headers)).toBe("localhost");
  });

  it("handles comma-separated forwarded values (takes first)", () => {
    const headers = makeHeaders({
      "x-forwarded-host": "everybody.bike, proxy.internal",
    });
    expect(getRpIDFromHeaders(headers)).toBe("everybody.bike");
  });
});

describe("getOriginFromHeaders", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_WEBAUTHN_ORIGIN;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns env origin when set", () => {
    process.env.NEXT_PUBLIC_WEBAUTHN_ORIGIN = "https://everybody.bike";
    const headers = makeHeaders({ host: "different.host.com" });
    expect(getOriginFromHeaders(headers)).toBe("https://everybody.bike");
  });

  it("ignores env when set to 'auto'", () => {
    process.env.NEXT_PUBLIC_WEBAUTHN_ORIGIN = "auto";
    const headers = makeHeaders({
      "x-forwarded-proto": "https",
      host: "everybody.bike",
    });
    expect(getOriginFromHeaders(headers)).toBe("https://everybody.bike");
  });

  it("derives origin from forwarded proto and host", () => {
    const headers = makeHeaders({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "everybody.bike",
    });
    expect(getOriginFromHeaders(headers)).toBe("https://everybody.bike");
  });

  it("falls back to http proto when no forwarded headers", () => {
    const headers = makeHeaders({ host: "localhost:3000" });
    expect(getOriginFromHeaders(headers)).toBe("http://localhost:3000");
  });

  it("returns http://localhost:3000 when no headers", () => {
    const headers = makeHeaders({});
    expect(getOriginFromHeaders(headers)).toBe("http://localhost:3000");
  });

  it("uses cf-visitor header for protocol detection", () => {
    const headers = makeHeaders({
      host: "everybody.bike",
      "cf-visitor": '{"scheme":"https"}',
    });
    expect(getOriginFromHeaders(headers)).toBe("https://everybody.bike");
  });

  it("handles malformed cf-visitor JSON gracefully", () => {
    const headers = makeHeaders({
      host: "everybody.bike",
      "cf-visitor": "not-json",
    });
    // Should fall back to http
    expect(getOriginFromHeaders(headers)).toBe("http://everybody.bike");
  });

  it("prefers x-forwarded-proto over cf-visitor", () => {
    const headers = makeHeaders({
      host: "everybody.bike",
      "x-forwarded-proto": "https",
      "cf-visitor": '{"scheme":"http"}',
    });
    expect(getOriginFromHeaders(headers)).toBe("https://everybody.bike");
  });
});
