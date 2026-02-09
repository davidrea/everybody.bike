import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getRpIDFromHeaders, rpName } from "@/lib/passkey";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const allowOverwrite = searchParams.get("overwrite") === "1";

  // Get existing passkeys for this user
  const { data: existingCredentials } = await supabase
    .from("passkey_credentials")
    .select("id")
    .eq("user_id", user.id);

  const headerList = headers();
  const rpID = getRpIDFromHeaders(headerList);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email || user.id,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: allowOverwrite
      ? []
      : (existingCredentials || []).map((cred) => ({
          id: cred.id,
        })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  // Store the challenge in the user's session metadata for verification
  // Using a server-side approach: store in a temporary way
  // We'll use Supabase to store the challenge temporarily
  await supabase.auth.updateUser({
    data: { webauthn_challenge: options.challenge },
  });

  return NextResponse.json(options);
}
