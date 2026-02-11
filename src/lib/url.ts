/**
 * Derive the application base URL.
 *
 * Precedence:
 *  1. Explicit env vars (APP_URL, NEXT_PUBLIC_APP_URL, etc.)
 *  2. Request origin header (only if it matches ALLOWED_HOSTS)
 *  3. x-forwarded-proto/host (only if host matches ALLOWED_HOSTS)
 *  4. host header (only if it matches ALLOWED_HOSTS)
 *  5. Fallback to localhost
 */

function getAllowedHosts(): Set<string> {
  const hosts = new Set<string>();
  // Always allow localhost variants
  hosts.add("localhost");
  hosts.add("localhost:3000");
  hosts.add("127.0.0.1");
  hosts.add("127.0.0.1:3000");

  // Parse allowed hosts from env
  const envHosts = process.env.ALLOWED_HOSTS;
  if (envHosts) {
    envHosts.split(",").forEach((h) => {
      const trimmed = h.trim();
      if (trimmed) hosts.add(trimmed.toLowerCase());
    });
  }

  // Also derive from known env vars
  for (const envVar of [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.BASE_URL,
  ]) {
    if (envVar) {
      try {
        hosts.add(new URL(envVar).host.toLowerCase());
      } catch {
        // skip invalid URLs
      }
    }
  }

  return hosts;
}

function isAllowedHost(host: string): boolean {
  return getAllowedHosts().has(host.toLowerCase());
}

export function getBaseUrl(request?: Request): string {
  const envBaseUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.BASE_URL;

  if (envBaseUrl) {
    return envBaseUrl.replace(/\/+$/, "");
  }

  if (!request) {
    return "http://localhost:3000";
  }

  // Trust origin header only if it resolves to an allowed host
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (isAllowedHost(parsed.host)) {
        return origin.replace(/\/+$/, "");
      }
    } catch {
      // ignore malformed origin
    }
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  // Only trust forwarded headers if the host is in the allowlist
  if (forwardedProto && forwardedHost && isAllowedHost(forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host =
    forwardedHost || request.headers.get("host") || new URL(request.url).host;

  if (!isAllowedHost(host)) {
    return "http://localhost:3000";
  }

  const proto =
    forwardedProto ||
    (host?.includes("localhost") || host?.includes("127.0.0.1")
      ? "http"
      : "https");

  return `${proto}://${host}`;
}
