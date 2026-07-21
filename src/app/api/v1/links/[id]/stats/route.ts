import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateApiRequest } from "@/lib/api-auth";
import { apiLimit, retryAfterSeconds } from "@/lib/ratelimit";
import {
  getClicksOverTime,
  getCountryBreakdown,
  getDeviceBreakdown,
  getTopReferrers,
} from "@/lib/stats";

export const runtime = "nodejs";

const DEFAULT_RANGE_DAYS = 30;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await apiLimit.limit(auth.apiKeyId);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rateLimitResult.reset)) } },
    );
  }

  const { id } = await params;

  // Ownership-scoped: a link that exists but belongs to someone else 404s
  // exactly like one that doesn't exist, same as every other ownership
  // check in this app — never a distinct response that would let an API
  // caller probe which link IDs are real.
  const link = await db.link.findFirst({
    where: { id, userId: auth.userId },
    select: { id: true, slug: true, clickCount: true },
  });
  if (!link) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [clicksOverTime, referrers, devices, countries] = await Promise.all([
    getClicksOverTime(link.id, DEFAULT_RANGE_DAYS),
    getTopReferrers(link.id, DEFAULT_RANGE_DAYS),
    getDeviceBreakdown(link.id, DEFAULT_RANGE_DAYS),
    getCountryBreakdown(link.id, DEFAULT_RANGE_DAYS),
  ]);

  return NextResponse.json({
    id: link.id,
    slug: link.slug,
    totalClicks: link.clickCount,
    rangeDays: DEFAULT_RANGE_DAYS,
    clicksOverTime,
    referrers,
    devices,
    countries,
  });
}
