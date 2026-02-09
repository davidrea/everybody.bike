import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const key = getVapidPublicKey();
    return NextResponse.json({ key });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "VAPID not configured" },
      { status: 500 },
    );
  }
}
