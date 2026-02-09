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

  const origin = request.headers.get("origin");
  if (origin) {
    return origin.replace(/\/+$/, "");
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host =
    forwardedHost || request.headers.get("host") || new URL(request.url).host;

  const proto =
    forwardedProto ||
    (host?.includes("localhost") || host?.includes("127.0.0.1")
      ? "http"
      : "https");

  return `${proto}://${host}`;
}
