import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aggregateDay } from "@/lib/aggregate";
import { recordCronSuccess } from "@/lib/cron-health";
import { isCronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";

const RETENTION_DAYS = 30;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  await aggregateDay(yesterday);

  // Raw events are only needed until they've been folded into DailyStat —
  // keeping them past the point any chart still reads them directly (Step
  // 35 repoints reads at DailyStat) just grows the table for no benefit.
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  const { count: deleted } = await db.clickEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  const aggregatedDate = yesterday.toISOString().slice(0, 10);
  await recordCronSuccess({ ranAt: new Date().toISOString(), aggregatedDate, deleted });

  return NextResponse.json({ aggregatedDate, deleted });
}
