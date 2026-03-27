import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Capture pino constructor args so we can inspect the config
vi.mock("pino", () => {
  const mockLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
    level: "debug",
  };
  const pino = vi.fn(() => mockLogger);
  pino.stdSerializers = {
    err: (e: Error) => ({ type: e.constructor.name, message: e.message, stack: e.stack }),
    errWithCause: (e: Error) => ({ type: e.constructor.name, message: e.message }),
  };
  pino.stdTimeFunctions = { isoTime: () => `,"time":"${new Date().toISOString()}"` };
  return { default: pino };
});

describe("logger module", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("creates a pino instance", async () => {
    const pino = (await import("pino")).default as ReturnType<typeof vi.fn>;
    const { logger } = await import("../logger");
    expect(pino).toHaveBeenCalledOnce();
    expect(logger).toBeDefined();
  });

  it("uses LOG_LEVEL env var when set", async () => {
    process.env.LOG_LEVEL = "warn";
    const pino = (await import("pino")).default as ReturnType<typeof vi.fn>;
    await import("../logger");
    const [config] = pino.mock.calls[0] as [{ level: string }][];
    expect(config.level).toBe("warn");
  });

  it("defaults to debug level outside production", async () => {
    delete process.env.LOG_LEVEL;
    process.env.NODE_ENV = "test";
    const pino = (await import("pino")).default as ReturnType<typeof vi.fn>;
    await import("../logger");
    const [config] = pino.mock.calls[0] as [{ level: string }][];
    expect(config.level).toBe("debug");
  });

  it("defaults to info level in production", async () => {
    delete process.env.LOG_LEVEL;
    process.env.NODE_ENV = "production";
    const pino = (await import("pino")).default as ReturnType<typeof vi.fn>;
    await import("../logger");
    const [config] = pino.mock.calls[0] as [{ level: string }][];
    expect(config.level).toBe("info");
  });

  it("includes service and env in base fields", async () => {
    process.env.NODE_ENV = "test";
    const pino = (await import("pino")).default as ReturnType<typeof vi.fn>;
    await import("../logger");
    const [config] = pino.mock.calls[0] as [{ base: Record<string, string> }][];
    expect(config.base.service).toBe("everybody.bike");
    expect(config.base.env).toBe("test");
  });

  it("registers err serializer for error objects", async () => {
    const pino = (await import("pino")).default as ReturnType<typeof vi.fn>;
    await import("../logger");
    const [config] = pino.mock.calls[0] as [{ serializers: Record<string, unknown> }][];
    expect(config.serializers.err).toBeDefined();
    expect(config.serializers.error).toBeDefined();
  });

  it("uses isoTime timestamp function", async () => {
    const pino = (await import("pino")).default as ReturnType<typeof vi.fn>;
    await import("../logger");
    const [config] = pino.mock.calls[0] as [{ timestamp: unknown }][];
    expect(config.timestamp).toBeDefined();
  });

  describe("logger interface", () => {
    it("exposes error, warn, info, debug methods", async () => {
      const { logger } = await import("../logger");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.debug).toBe("function");
    });
  });
});
