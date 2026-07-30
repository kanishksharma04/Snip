import { NextResponse } from "next/server";
import { getCronHealth } from "@/lib/cron-health";
import { isCronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";

// The cron fires once a day (vercel.json: "0 3 * * *") — 36h gives it a full
// extra cycle of slack before flagging unhealthy, so one slightly late or
// retried run doesn't false-alarm, but two missed days in a row will.
const STALE_AFTER_HOURS = 36;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lastRun = await getCronHealth();
  if (!lastRun) {
    return NextResponse.json({ healthy: false, lastRun: null, reason: "never run" }, { status: 503 });
  }

  const hoursSinceLastRun = (Date.now() - new Date(lastRun.ranAt).getTime()) / (60 * 60 * 1000);
  const healthy = hoursSinceLastRun <= STALE_AFTER_HOURS;

  return NextResponse.json(
    { healthy, lastRun, hoursSinceLastRun: Math.round(hoursSinceLastRun * 10) / 10 },
    { status: healthy ? 200 : 503 },
  );
}
