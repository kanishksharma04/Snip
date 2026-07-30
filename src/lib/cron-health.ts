import { redis, LINK_CACHE_PREFIX } from "@/lib/redis";

// One exact key, written once a day by the cron itself — cheap enough that
// it doesn't meaningfully move the needle on the shared instance's 500k
// commands/month budget. Recording a real "last successful run" event here
// (rather than inferring freshness from DailyStat's most recent date) is
// deliberate: a day with zero real clicks across every link would leave
// DailyStat looking stale even though the cron ran and correctly had
// nothing to aggregate. This key is written unconditionally on success.
const CRON_HEALTH_KEY = `${LINK_CACHE_PREFIX}cron:aggregate:last-run`;

export type CronHealthRecord = {
  ranAt: string;
  aggregatedDate: string;
  deleted: number;
};

export async function recordCronSuccess(record: CronHealthRecord): Promise<void> {
  await redis.set(CRON_HEALTH_KEY, record);
}

export async function getCronHealth(): Promise<CronHealthRecord | null> {
  return redis.get<CronHealthRecord>(CRON_HEALTH_KEY);
}
