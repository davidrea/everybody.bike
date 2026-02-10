import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getOriginFromHeaders, getRpIDFromHeaders } from "@/lib/passkey";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const incomingCredential = body?.credential ?? body;
  const passkeyName =
    typeof body?.passkeyName === "string" && body.passkeyName.trim().length > 0
      ? body.passkeyName.trim()
      : null;
  const allowOverwrite = body?.allowOverwrite === true;
  const expectedChallenge = user.user_metadata?.webauthn_challenge;

  if (!expectedChallenge) {
    return NextResponse.json({ error: "No challenge found" }, { status: 400 });
  }

  try {
    const headerList = await headers();
    const rpID = getRpIDFromHeaders(headerList);
    const origin = getOriginFromHeaders(headerList);

    const verification = await verifyRegistrationResponse({
      response: incomingCredential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    const { credential: verifiedCredential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    // Store the credential in the database
    const publicKeyHex = Buffer.from(verifiedCredential.publicKey).toString("hex");
    const insertPayload = {
      id: verifiedCredential.id,
      user_id: user.id,
      // Store as bytea-hex format for Postgres (\\x...)
      public_key: `\\x${publicKeyHex}`,
      counter: Number(verifiedCredential.counter),
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
      transports: incomingCredential?.response?.transports || [],
      name: passkeyName,
    };

    const { error } = allowOverwrite
      ? await supabase.from("passkey_credentials").upsert(insertPayload, {
          onConflict: "id",
        })
      : await supabase.from("passkey_credentials").insert(insertPayload);

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
