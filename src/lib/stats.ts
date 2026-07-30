import { z } from "zod";
import { db } from "@/lib/db";
import { dateOnlyUTC } from "@/lib/aggregate";

// Step 32 measured the "before": every chart query re-scanned raw
// ClickEvent rows from scratch, degrading as the range widened and the
// table grew. Everything before today now reads pre-aggregated DailyStat
// rows instead (Step 33/34 keep those current via a daily cron) — only
// today, which hasn't been aggregated yet, still reads live ClickEvent rows.
function startOfRange(days: number): Date {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

// aggregateDay is the only writer of these columns, and it always writes a
// plain string->number map — but that's an invariant this file is trusting,
// not something Postgres/Prisma enforces on a `Json` column. Parsing on read
// turns a future aggregation bug (or any other write into DailyStat) into a
// loud, immediate error instead of a chart silently rendering NaN/garbage
// counts with no indication anything is wrong.
const countMapSchema = z.record(z.string(), z.number());

function asCountMap(value: unknown): Record<string, number> {
  return countMapSchema.parse(value);
}

function mergeCountMaps(maps: Record<string, number>[]): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map)) {
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  return merged;
}

function sortedByClicksDesc(merged: Record<string, number>): [string, number][] {
  return Object.entries(merged).sort((a, b) => b[1] - a[1]);
}

// The oldest day any link's DailyStat coverage reaches back to, globally —
// every link gets aggregated by the same daily cron starting from the same
// point, so this is one number, not a per-link query. DailyStat rows are
// never deleted (only raw ClickEvent rows are, by retention), so this
// naturally grows by a day every day the cron runs — it's not a fixed "30
// days," just however far back real aggregated history currently extends.
export async function getEarliestStatsDate(): Promise<Date | null> {
  const result = await db.dailyStat.aggregate({ _min: { date: true } });
  return result._min.date;
}

export type ClicksOverTimePoint = { date: string; clicks: number };

// Returns only days that actually had at least one click — a sparse series.
// Filling in zero-click days for a continuous chart axis is Step 27's
// rendering concern, not this query layer's.
export async function getClicksOverTime(
  linkId: string,
  days: number,
): Promise<ClicksOverTimePoint[]> {
  const rangeStart = startOfRange(days);
  const todayStart = dateOnlyUTC(new Date());

  const [dailyStats, todayEvents] = await Promise.all([
    db.dailyStat.findMany({
      where: { linkId, date: { gte: rangeStart, lt: todayStart } },
      select: { date: true, clicks: true },
    }),
    db.clickEvent.findMany({
      where: { linkId, createdAt: { gte: todayStart } },
      select: { createdAt: true },
    }),
  ]);

  const counts = new Map<string, number>();
  for (const stat of dailyStats) {
    counts.set(stat.date.toISOString().slice(0, 10), stat.clicks);
  }
  for (const event of todayEvents) {
    const day = event.createdAt.toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([date, clicks]) => ({ date, clicks }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type ReferrerCount = { referrer: string; clicks: number };

export async function getTopReferrers(linkId: string, days: number): Promise<ReferrerCount[]> {
  const rangeStart = startOfRange(days);
  const todayStart = dateOnlyUTC(new Date());

  const [dailyStats, todayGrouped] = await Promise.all([
    db.dailyStat.findMany({
      where: { linkId, date: { gte: rangeStart, lt: todayStart } },
      select: { referrers: true },
    }),
    db.clickEvent.groupBy({
      by: ["referrer"],
      where: { linkId, createdAt: { gte: todayStart } },
      _count: { _all: true },
    }),
  ]);

  const merged = mergeCountMaps(dailyStats.map((stat) => asCountMap(stat.referrers)));
  for (const group of todayGrouped) {
    const key = group.referrer ?? "direct";
    merged[key] = (merged[key] ?? 0) + group._count._all;
  }

  return sortedByClicksDesc(merged).map(([referrer, clicks]) => ({ referrer, clicks }));
}

export type DeviceCount = { device: string; clicks: number };

export async function getDeviceBreakdown(linkId: string, days: number): Promise<DeviceCount[]> {
  const rangeStart = startOfRange(days);
  const todayStart = dateOnlyUTC(new Date());

  const [dailyStats, todayGrouped] = await Promise.all([
    db.dailyStat.findMany({
      where: { linkId, date: { gte: rangeStart, lt: todayStart } },
      select: { devices: true },
    }),
    db.clickEvent.groupBy({
      by: ["device"],
      where: { linkId, createdAt: { gte: todayStart } },
      _count: { _all: true },
    }),
  ]);

  const merged = mergeCountMaps(dailyStats.map((stat) => asCountMap(stat.devices)));
  for (const group of todayGrouped) {
    const key = group.device ?? "Unknown";
    merged[key] = (merged[key] ?? 0) + group._count._all;
  }

  return sortedByClicksDesc(merged).map(([device, clicks]) => ({ device, clicks }));
}

export type CountryCount = { country: string; clicks: number };

export async function getCountryBreakdown(linkId: string, days: number): Promise<CountryCount[]> {
  const rangeStart = startOfRange(days);
  const todayStart = dateOnlyUTC(new Date());

  const [dailyStats, todayGrouped] = await Promise.all([
    db.dailyStat.findMany({
      where: { linkId, date: { gte: rangeStart, lt: todayStart } },
      select: { countries: true },
    }),
    db.clickEvent.groupBy({
      by: ["country"],
      where: { linkId, createdAt: { gte: todayStart } },
      _count: { _all: true },
    }),
  ]);

  const merged = mergeCountMaps(dailyStats.map((stat) => asCountMap(stat.countries)));
  for (const group of todayGrouped) {
    const key = group.country ?? "Unknown";
    merged[key] = (merged[key] ?? 0) + group._count._all;
  }

  return sortedByClicksDesc(merged).map(([country, clicks]) => ({ country, clicks }));
}
