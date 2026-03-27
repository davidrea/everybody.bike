import pino from "pino";

/**
 * Structured JSON logger — writes to stdout.
 *
 * In production, stdout is collected by the Vector sidecar and forwarded to
 * Logflare, where logs are queryable in Supabase Studio's Log Explorer.
 *
 * Log-level convention used across all API routes:
 *   error — 5xx / unexpected failures, DB errors, missing env vars
 *   warn  — 4xx client errors (401, 403, 429, 400, 404, 409)
 *   info  — successful mutations worth auditing (create / update / delete)
 *   debug — verbose operational detail (disabled in production)
 *
 * Call signature for every site:
 *   logger.warn({ route, userId, ...extra }, "human-readable message")
 *   logger.error({ route, userId, err }, "human-readable message")
 *
 * The `err` field is serialized by pino's standard error serializer, which
 * captures type, message, and stack without needing manual formatting.
 */

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: {
    service: "everybody.bike",
    env: process.env.NODE_ENV ?? "unknown",
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
