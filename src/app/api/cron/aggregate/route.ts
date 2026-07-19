import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aggregateDay } from "@/lib/aggregate";

export const runtime = "nodejs";

const RETENTION_DAYS = 30;

// Vercel Cron sends "Authorization: Bearer $CRON_SECRET" automatically for
// scheduled invocations (see vercel.json), but this route is a public URL —
// anyone who knows the path can hit it, so a matching secret is the only
// thing standing between an open endpoint and one that requires the value
// only this deployment and its Vercel Cron config know.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
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

  return NextResponse.json({ aggregatedDate: yesterday.toISOString().slice(0, 10), deleted });
}
