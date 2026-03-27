import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOriginFromHeaders, getRpIDFromHeaders } from "@/lib/passkey";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// 10 verification attempts per 5 minutes per IP (tighter — failed attempts are suspicious)
const limiter = createRateLimiter({ windowMs: 5 * 60_000, max: 10 });

export async function POST(request: Request) {
  if (!limiter.check(getClientIp(request))) {
    logger.warn({ route: 'POST /api/auth/passkey/login/verify' }, 'Rate limit exceeded');
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const cookieStore = await cookies();
  const expectedChallenge = cookieStore.get("webauthn_challenge")?.value;

  if (!expectedChallenge) {
    logger.warn({ route: 'POST /api/auth/passkey/login/verify' }, 'No challenge cookie found');
    return NextResponse.json({ error: "No challenge found" }, { status: 400 });
  }

  const body = await request.json();
  const credentialId = body.id;

  if (!credentialId) {
    logger.warn({ route: 'POST /api/auth/passkey/login/verify' }, 'No credential ID in request');
    return NextResponse.json({ error: "No credential ID" }, { status: 400 });
  }

  // Look up the credential using admin client (no RLS)
  const adminClient = createAdminClient();
  const { data: credential, error: credError } = await adminClient
    .from("passkey_credentials")
    .select("*")
    .eq("id", credentialId)
    .single();

  if (credError || !credential) {
    logger.warn({ route: 'POST /api/auth/passkey/login/verify', credentialId }, 'Credential not found');
    return NextResponse.json({ error: "Credential not found" }, { status: 400 });
  }

  try {
    // Decode the stored public key from bytea (\\x...) or base64 (legacy)
    const publicKeyRaw = String(credential.public_key);
    const publicKeyBytes = publicKeyRaw.startsWith("\\x")
      ? Uint8Array.from(Buffer.from(publicKeyRaw.slice(2), "hex"))
      : Uint8Array.from(Buffer.from(publicKeyRaw, "base64"));

    const headerList = await headers();
    const rpID = getRpIDFromHeaders(headerList);
    const origin = getOriginFromHeaders(headerList);

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credential.id,
        publicKey: publicKeyBytes,
        counter: credential.counter,
        transports: credential.transports || [],
      },
    });

    if (!verification.verified) {
      logger.warn({ route: 'POST /api/auth/passkey/login/verify', credentialId }, 'Passkey verification failed');
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    // Update the credential counter
    await adminClient
      .from("passkey_credentials")
      .update({
        counter: Number(verification.authenticationInfo.newCounter),
        last_used_at: new Date().toISOString(),
      })
      .eq("id", credentialId);

    // Clear the challenge cookie
    cookieStore.delete("webauthn_challenge");

    // Create a Supabase session for this user using admin client
    // Generate a magic link token and sign them in
    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(
      credential.user_id,
    );

    if (userError || !userData.user) {
      return NextResponse.json({ error: "User not found" }, { status: 400 });
    }

    // Generate a magic link for the user (one-time sign in)
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: userData.user.email!,
      });

    if (linkError || !linkData) {
      logger.error({ route: 'POST /api/auth/passkey/login/verify', userId: credential.user_id, err: linkError }, 'Failed to create session via generateLink');
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    // Exchange the token_hash for a session via the user-facing Supabase client
    const response = NextResponse.json({ verified: true });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });

    if (verifyError) {
      logger.error({ route: 'POST /api/auth/passkey/login/verify', userId: credential.user_id, err: verifyError }, 'verifyOtp failed during passkey login');
      return NextResponse.json({ error: "Session creation failed" }, { status: 500 });
    }

    logger.info({ route: 'POST /api/auth/passkey/login/verify', user_id: credential.user_id }, 'Passkey login verified');
    return response;
  } catch (err) {
    logger.error({ route: 'POST /api/auth/passkey/login/verify', err }, 'Unexpected error during passkey login verification');
    const message = err instanceof Error ? err.message : "Verification error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
