import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  async headers() {
    // Build CSP: restrict scripts/styles to self, allow Supabase API connections
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const connectSrc = supabaseUrl
      ? `'self' ${supabaseUrl} wss://${new URL(supabaseUrl).host}`
      : "'self'";
    const csp = [
      "default-src 'self'",
      // Next.js requires 'unsafe-inline' for styles (CSS-in-JS) and 'unsafe-eval' in dev
      `script-src 'self'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src ${connectSrc}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "worker-src 'self'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp,
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
