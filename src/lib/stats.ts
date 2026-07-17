import { db } from "@/lib/db";

// Queries ClickEvent directly — the naive, correct-but-not-yet-fast version.
// Step 32 measures how this degrades against ~100k rows; Steps 33-35 replace
// the read path with pre-aggregated DailyStat rows. Not optimizing early.
function startOfRange(days: number): Date {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export type ClicksOverTimePoint = { date: string; clicks: number };

// Returns only days that actually had at least one click — a sparse series.
// Filling in zero-click days for a continuous chart axis is Step 27's
// rendering concern, not this query layer's.
export async function getClicksOverTime(
  linkId: string,
  days: number,
): Promise<ClicksOverTimePoint[]> {
  const events = await db.clickEvent.findMany({
    where: { linkId, createdAt: { gte: startOfRange(days) } },
    select: { createdAt: true },
  });

  const counts = new Map<string, number>();
  for (const event of events) {
    const day = event.createdAt.toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([date, clicks]) => ({ date, clicks }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type ReferrerCount = { referrer: string; clicks: number };

export async function getTopReferrers(linkId: string, days: number): Promise<ReferrerCount[]> {
  const grouped = await db.clickEvent.groupBy({
    by: ["referrer"],
    where: { linkId, createdAt: { gte: startOfRange(days) } },
    _count: { _all: true },
  });

  return grouped
    .map((g) => ({ referrer: g.referrer ?? "direct", clicks: g._count._all }))
    .sort((a, b) => b.clicks - a.clicks);
}

export type DeviceCount = { device: string; clicks: number };

export async function getDeviceBreakdown(linkId: string, days: number): Promise<DeviceCount[]> {
  const grouped = await db.clickEvent.groupBy({
    by: ["device"],
    where: { linkId, createdAt: { gte: startOfRange(days) } },
    _count: { _all: true },
  });

  return grouped
    .map((g) => ({ device: g.device ?? "Unknown", clicks: g._count._all }))
    .sort((a, b) => b.clicks - a.clicks);
}

export type CountryCount = { country: string; clicks: number };

export async function getCountryBreakdown(linkId: string, days: number): Promise<CountryCount[]> {
  const grouped = await db.clickEvent.groupBy({
    by: ["country"],
    where: { linkId, createdAt: { gte: startOfRange(days) } },
    _count: { _all: true },
  });

  return grouped
    .map((g) => ({ country: g.country ?? "Unknown", clicks: g._count._all }))
    .sort((a, b) => b.clicks - a.clicks);
}
