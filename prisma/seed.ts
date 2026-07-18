import { db } from "../src/lib/db";
import { generateSlug } from "../src/lib/slug";

// Step 31 — Phase 6 needs a dataset large enough that the naive per-request
// ClickEvent scan (Step 26) actually hurts: with 50 real clicks the query is
// instant and Steps 32-35's whole aggregation lesson is invisible. ~100k
// rows across ~20 links over 90 days gets the naive query slow enough to
// measure, without taking an unreasonable amount of time to seed.
const LINK_COUNT = 20;
const TOTAL_DAYS = 90;
const TARGET_TOTAL = 100_000;
const BASE_DAILY_VOLUME = TARGET_TOTAL / TOTAL_DAYS;
const BATCH_SIZE = 5000;

const WEEKDAY_MULTIPLIER = 1.2;
const WEEKEND_MULTIPLIER = 0.6;

const COUNTRIES = ["US", "IN", "GB", "DE", "BR", "CA", "AU", "FR", "JP", "NG"];
const REFERRERS = ["google.com", "twitter.com", "facebook.com", "direct", "direct", "linkedin.com"];

type DeviceProfile = { device: "desktop" | "mobile" | "tablet"; os: string; browser: string };
const DEVICE_PROFILES: DeviceProfile[] = [
  { device: "desktop", os: "Windows", browser: "Chrome" },
  { device: "desktop", os: "macOS", browser: "Safari" },
  { device: "mobile", os: "iOS", browser: "Safari" },
  { device: "mobile", os: "Android", browser: "Chrome" },
  { device: "tablet", os: "iOS", browser: "Safari" },
];

// Weight by hour-of-day (UTC): overnight hours are rare, mid-day/evening
// hours are common — a flat distribution would make the "time-of-day"
// requirement pointless, since every hour would look equally busy.
const HOUR_WEIGHTS = [
  1, 1, 1, 1, 1, 2, // 0-5
  3, 5, 7, 8, 8, 9, // 6-11
  9, 9, 8, 8, 8, 9, // 12-17
  10, 9, 7, 5, 3, 2, // 18-23
];
const HOUR_WEIGHT_TOTAL = HOUR_WEIGHTS.reduce((sum, w) => sum + w, 0);

// A handful of links get most of the traffic, the rest get a trickle — real
// link popularity is never uniform across a user's links.
function linkWeights(count: number): number[] {
  return Array.from({ length: count }, (_, i) => 1 / (i + 1));
}

function pickWeightedIndex(weights: number[], totalWeight: number): number {
  let roll = Math.random() * totalWeight;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

function pickWeightedHour(): number {
  return pickWeightedIndex(HOUR_WEIGHTS, HOUR_WEIGHT_TOTAL);
}

function randomHex(length: number): string {
  let out = "";
  while (out.length < length) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

function randomChoice<T>(items: readonly T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[index] as T;
}

async function main() {
  const user = await db.user.findFirstOrThrow();

  console.log(`Seeding ${LINK_COUNT} links for user ${user.email}...`);

  const linkCreatedAt = new Date();
  linkCreatedAt.setUTCDate(linkCreatedAt.getUTCDate() - (TOTAL_DAYS + 5));

  const links = await Promise.all(
    Array.from({ length: LINK_COUNT }, async (_, i) => {
      return db.link.create({
        data: {
          userId: user.id,
          slug: generateSlug(),
          destination: `https://example.com/seed-destination-${i + 1}`,
          title: `Seed link ${i + 1}`,
          createdAt: linkCreatedAt,
        },
        select: { id: true },
      });
    }),
  );

  const weights = linkWeights(links.length);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const clickCounts = new Map<string, number>(links.map((link) => [link.id, 0]));

  type PendingEvent = {
    linkId: string;
    ipHash: string;
    country: string;
    device: "desktop" | "mobile" | "tablet";
    os: string;
    browser: string;
    referrer: string;
    createdAt: Date;
  };

  let buffer: PendingEvent[] = [];
  let totalInserted = 0;

  async function flush() {
    if (buffer.length === 0) return;
    await db.clickEvent.createMany({ data: buffer });
    totalInserted += buffer.length;
    buffer = [];
  }

  console.log(`Generating ~${TARGET_TOTAL} click events across ${TOTAL_DAYS} days...`);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let dayOffset = TOTAL_DAYS - 1; dayOffset >= 0; dayOffset--) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - dayOffset);
    const dayOfWeek = day.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const multiplier = isWeekend ? WEEKEND_MULTIPLIER : WEEKDAY_MULTIPLIER;
    const jitter = 0.85 + Math.random() * 0.3;
    const dayVolume = Math.round(BASE_DAILY_VOLUME * multiplier * jitter);

    for (let i = 0; i < dayVolume; i++) {
      const linkIndex = pickWeightedIndex(weights, totalWeight);
      const link = links[linkIndex];
      if (!link) continue;

      const hour = pickWeightedHour();
      const minute = Math.floor(Math.random() * 60);
      const second = Math.floor(Math.random() * 60);
      const createdAt = new Date(day);
      createdAt.setUTCHours(hour, minute, second, 0);

      const profile = randomChoice(DEVICE_PROFILES);

      buffer.push({
        linkId: link.id,
        ipHash: randomHex(16),
        country: randomChoice(COUNTRIES),
        device: profile.device,
        os: profile.os,
        browser: profile.browser,
        referrer: randomChoice(REFERRERS),
        createdAt,
      });
      clickCounts.set(link.id, (clickCounts.get(link.id) ?? 0) + 1);

      if (buffer.length >= BATCH_SIZE) {
        await flush();
      }
    }
  }

  await flush();

  console.log(`Inserted ${totalInserted} click events. Syncing denormalized clickCount...`);

  for (const [linkId, count] of clickCounts) {
    await db.link.update({ where: { id: linkId }, data: { clickCount: count } });
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
