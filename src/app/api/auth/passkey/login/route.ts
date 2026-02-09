import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { headers } from "next/headers";
import { getRpIDFromHeaders } from "@/lib/passkey";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const headerList = headers();
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
