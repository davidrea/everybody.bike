import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { headers } from "next/headers";
import { getRpIDFromHeaders } from "@/lib/passkey";
import { cookies } from "next/headers";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

// 20 challenge requests per 5 minutes per IP
const limiter = createRateLimiter({ windowMs: 5 * 60_000, max: 20 });

export async function GET(request: Request) {
  if (!limiter.check(getClientIp(request))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const headerList = await headers();
    const rpID = getRpIDFromHeaders(headerList);

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      // Allow any credential — discoverable credentials flow
    });

    // Store challenge in a cookie for verification
    const cookieStore = await cookies();
    cookieStore.set("webauthn_challenge", options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 300, // 5 minutes
      path: "/",
    });

    return NextResponse.json(options);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate options";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
