import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/url";

function buildFeedUrls(baseUrl: string, token: string) {
  const httpUrl = `${baseUrl}/api/calendar/feed?token=${token}`;
  const webcalUrl = httpUrl.replace(/^https?:\/\//, "webcal://");
  return { httpUrl, webcalUrl };
}

async function getOrCreateToken(userId: string, request: Request, forceNew: boolean) {
  const admin = createAdminClient();

  if (!forceNew) {
    const { data: profile, error } = await admin
      .from("profiles")
      .select("calendar_token")
      .eq("id", userId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (profile?.calendar_token) {
      const baseUrl = getBaseUrl(request);
      const urls = buildFeedUrls(baseUrl, profile.calendar_token);
      return { token: profile.calendar_token, ...urls };
    }
  }

  const token = crypto.randomUUID();
  const { error: updateError } = await admin
    .from("profiles")
    .update({ calendar_token: token })
    .eq("id", userId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const baseUrl = getBaseUrl(request);
  const urls = buildFeedUrls(baseUrl, token);
  return { token, ...urls };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { httpUrl, webcalUrl } = await getOrCreateToken(user.id, request, false);
    return NextResponse.json({ url: httpUrl, webcal_url: webcalUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load calendar link" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { httpUrl, webcalUrl } = await getOrCreateToken(user.id, request, true);
    return NextResponse.json({ url: httpUrl, webcal_url: webcalUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to rotate calendar link" },
      { status: 500 },
    );
  }
}
