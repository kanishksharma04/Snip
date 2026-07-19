import { db } from "@/lib/db";

export function dateOnlyUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

type DayBucket = {
  clicks: number;
  visitors: Set<string>;
  countries: Record<string, number>;
  devices: Record<string, number>;
  referrers: Record<string, number>;
};

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

// Recomputes DailyStat for one UTC calendar day directly from ClickEvent
// rows and upserts on (linkId, date). This always overwrites with a fresh
// full recompute rather than incrementing existing totals, so re-running it
// for a date that was already aggregated (a retried cron call, a manual
// backfill) produces the exact same numbers instead of double-counting.
export async function aggregateDay(date: Date): Promise<void> {
  const day = dateOnlyUTC(date);
  const nextDay = new Date(day);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  const events = await db.clickEvent.findMany({
    where: { createdAt: { gte: day, lt: nextDay } },
    select: { linkId: true, ipHash: true, country: true, device: true, referrer: true },
  });

  const buckets = new Map<string, DayBucket>();
  for (const event of events) {
    let bucket = buckets.get(event.linkId);
    if (!bucket) {
      bucket = { clicks: 0, visitors: new Set(), countries: {}, devices: {}, referrers: {} };
      buckets.set(event.linkId, bucket);
    }
    bucket.clicks += 1;
    bucket.visitors.add(event.ipHash);
    increment(bucket.countries, event.country ?? "Unknown");
    increment(bucket.devices, event.device ?? "Unknown");
    increment(bucket.referrers, event.referrer ?? "direct");
  }

  for (const [linkId, bucket] of buckets) {
    const data = {
      clicks: bucket.clicks,
      uniqueVisitors: bucket.visitors.size,
      countries: bucket.countries,
      devices: bucket.devices,
      referrers: bucket.referrers,
    };

    await db.dailyStat.upsert({
      where: { linkId_date: { linkId, date: day } },
      create: { linkId, date: day, ...data },
      update: data,
    });
  }
}
