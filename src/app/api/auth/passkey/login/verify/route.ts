import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rpID, origin } from "@/lib/passkey";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const expectedChallenge = cookieStore.get("webauthn_challenge")?.value;

  if (!expectedChallenge) {
    return NextResponse.json({ error: "No challenge found" }, { status: 400 });
  }

  const body = await request.json();
  const credentialId = body.id;

  if (!credentialId) {
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
    return NextResponse.json({ error: "Credential not found" }, { status: 400 });
  }

  try {
    // Decode the stored public key from base64
    const publicKeyBytes = Uint8Array.from(Buffer.from(credential.public_key, "base64"));

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
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    // Update the credential counter
    await adminClient
      .from("passkey_credentials")
      .update({ counter: Number(verification.authenticationInfo.newCounter) })
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
      return NextResponse.json({ error: "Session creation failed" }, { status: 500 });
    }

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
