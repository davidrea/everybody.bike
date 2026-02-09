// WebAuthn Relying Party configuration
export const rpName = process.env.NEXT_PUBLIC_WEBAUTHN_RP_NAME || "everybody.bike";

function getHeaderValue(headers: Headers, name: string) {
  const raw = headers.get(name);
  if (!raw) return null;
  // Handle comma-separated forwarded values
  return raw.split(",")[0]?.trim() || null;
}

function getHost(headers: Headers) {
  return (
    getHeaderValue(headers, "x-forwarded-host") ||
    getHeaderValue(headers, "host") ||
    null
  );
}

function getProto(headers: Headers) {
  const forwarded = getHeaderValue(headers, "x-forwarded-proto");
  if (forwarded) return forwarded;

  const cfVisitor = headers.get("cf-visitor");
  if (cfVisitor) {
    try {
      const parsed = JSON.parse(cfVisitor);
      if (typeof parsed?.scheme === "string") return parsed.scheme;
    } catch {
      // ignore parse errors
    }
  }

  return null;
}

function stripPort(host: string) {
  return host.includes(":") ? host.split(":")[0] : host;
}

export function getRpIDFromHeaders(headers: Headers) {
  const envRpID = process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID;
  if (envRpID && envRpID !== "auto") return envRpID;

  const host = getHost(headers);
  if (!host) return "localhost";
  return stripPort(host);
}

export function getOriginFromHeaders(headers: Headers) {
  const envOrigin = process.env.NEXT_PUBLIC_WEBAUTHN_ORIGIN;
  if (envOrigin && envOrigin !== "auto") return envOrigin;

  const host = getHost(headers);
  if (!host) return "http://localhost:3000";

  const proto = getProto(headers) || "http";
  return `${proto}://${host}`;
}
