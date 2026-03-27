import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push-server";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  try {
    const key = getVapidPublicKey();
    return NextResponse.json({ key });
  } catch (err) {
    logger.error({ route: "GET /api/notifications/vapid", err }, "VAPID not configured");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "VAPID not configured" },
      { status: 500 },
    );
  }
}
