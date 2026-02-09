import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { rpID, origin } from "@/lib/passkey";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const expectedChallenge = user.user_metadata?.webauthn_challenge;

  if (!expectedChallenge) {
    return NextResponse.json({ error: "No challenge found" }, { status: 400 });
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    // Store the credential in the database
    const { error } = await supabase.from("passkey_credentials").insert({
      id: credential.id,
      user_id: user.id,
      public_key: Buffer.from(credential.publicKey).toString("base64"),
      counter: Number(credential.counter),
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
      transports: body.response?.transports || [],
    });

    if (error) {
      return NextResponse.json({ error: "Failed to store credential" }, { status: 500 });
    }

    // Clear the challenge
    await supabase.auth.updateUser({
      data: { webauthn_challenge: null },
    });

    return NextResponse.json({ verified: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
