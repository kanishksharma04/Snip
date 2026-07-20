import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getSnipBaseUrl } from "@/lib/validations";
import {
  getClicksOverTime,
  getCountryBreakdown,
  getDeviceBreakdown,
  getTopReferrers,
} from "@/lib/stats";
import { ActivityFeed, ActivityFeedSkeleton } from "@/components/features/activity-feed";
import { ActiveToggle } from "@/components/features/active-toggle";
import { CopyButton } from "@/components/features/copy-button";
import { ClicksChart, ClicksChartSkeleton } from "@/components/features/clicks-chart";
import { ReferrerTable, ReferrerTableSkeleton } from "@/components/features/referrer-table";
import { DevicePieChart, DevicePieChartSkeleton } from "@/components/features/device-pie-chart";
import { CountryList, CountryListSkeleton } from "@/components/features/country-list";
import { RangeTabs, parseRangeDays } from "@/components/features/range-tabs";
import { QrCode } from "@/components/features/qr-code";

// Each stats section fetches and renders independently inside its own
// Suspense boundary, so a slow or failing query (e.g. once Step 31 seeds
// 100k rows) only stalls/breaks its own card instead of the whole page —
// and a thrown error here bubbles to error.tsx instead of a blank page.
async function ClicksOverTimeSection({ linkId, days }: { linkId: string; days: number }) {
  const data = await getClicksOverTime(linkId, days);
  return <ClicksChart data={data} days={days} />;
}

async function ReferrersSection({ linkId, days }: { linkId: string; days: number }) {
  const data = await getTopReferrers(linkId, days);
  return <ReferrerTable data={data} />;
}

async function DevicesSection({ linkId, days }: { linkId: string; days: number }) {
  const data = await getDeviceBreakdown(linkId, days);
  return <DevicePieChart data={data} />;
}

async function CountriesSection({ linkId, days }: { linkId: string; days: number }) {
  const data = await getCountryBreakdown(linkId, days);
  return <CountryList data={data} />;
}

async function ActivitySection({ linkId }: { linkId: string }) {
  const events = await db.clickEvent.findMany({
    where: { linkId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, createdAt: true, country: true, device: true, referrer: true },
  });
  return <ActivityFeed events={events} />;
}

export default async function LinkDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login?callbackUrl=/dashboard");
  }

  const { id } = await params;
  const days = parseRangeDays((await searchParams).range);

  // Ownership check: a link that exists but belongs to someone else 404s
  // exactly like one that doesn't exist at all — never a distinct "not
  // yours" response that would let a user probe which link IDs are real.
  const link = await db.link.findFirst({
    where: { id, userId },
    select: { id: true, slug: true, destination: true, clickCount: true, isActive: true },
  });
  if (!link) {
    notFound();
  }

  const shortUrl = `${getSnipBaseUrl()}/${link.slug}`;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{link.slug}</h1>
          <ActiveToggle linkId={link.id} isActive={link.isActive} />
        </div>
        <p className="text-muted-foreground max-w-xl truncate" title={link.destination}>
          {link.destination}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm">{shortUrl}</span>
          <CopyButton text={shortUrl} />
        </div>
        <p className="text-sm">
          <span className="font-medium">{link.clickCount}</span>{" "}
          <span className="text-muted-foreground">total clicks</span>
        </p>
        <QrCode linkId={link.id} slug={link.slug} />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Clicks over time</h2>
          <RangeTabs linkId={link.id} activeDays={days} />
        </div>
        <Suspense key={`clicks-${days}`} fallback={<ClicksChartSkeleton />}>
          <ClicksOverTimeSection linkId={link.id} days={days} />
        </Suspense>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Top referrers</h2>
          <Suspense key={`referrers-${days}`} fallback={<ReferrerTableSkeleton />}>
            <ReferrersSection linkId={link.id} days={days} />
          </Suspense>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">Devices</h2>
          <Suspense key={`devices-${days}`} fallback={<DevicePieChartSkeleton />}>
            <DevicesSection linkId={link.id} days={days} />
          </Suspense>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">Countries</h2>
          <Suspense key={`countries-${days}`} fallback={<CountryListSkeleton />}>
            <CountriesSection linkId={link.id} days={days} />
          </Suspense>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
        <Suspense fallback={<ActivityFeedSkeleton />}>
          <ActivitySection linkId={link.id} />
        </Suspense>
      </div>
    </div>
  );
}
