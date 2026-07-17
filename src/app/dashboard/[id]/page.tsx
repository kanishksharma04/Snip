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
import { ActivityFeed } from "@/components/features/activity-feed";
import { ActiveToggle } from "@/components/features/active-toggle";
import { CopyButton } from "@/components/features/copy-button";
import { ClicksChart } from "@/components/features/clicks-chart";
import { ReferrerTable } from "@/components/features/referrer-table";
import { DevicePieChart } from "@/components/features/device-pie-chart";
import { CountryList } from "@/components/features/country-list";

// Default range until Step 29 adds the actual selector UI.
const DEFAULT_RANGE_DAYS = 30;

export default async function LinkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login?callbackUrl=/dashboard");
  }

  const { id } = await params;

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

  const events = await db.clickEvent.findMany({
    where: { linkId: link.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, createdAt: true, country: true, device: true, referrer: true },
  });

  const shortUrl = `${getSnipBaseUrl()}/${link.slug}`;
  const clicksOverTime = await getClicksOverTime(link.id, DEFAULT_RANGE_DAYS);
  const [referrers, devices, countries] = await Promise.all([
    getTopReferrers(link.id, DEFAULT_RANGE_DAYS),
    getDeviceBreakdown(link.id, DEFAULT_RANGE_DAYS),
    getCountryBreakdown(link.id, DEFAULT_RANGE_DAYS),
  ]);

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
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Clicks over time</h2>
        <ClicksChart data={clicksOverTime} days={DEFAULT_RANGE_DAYS} />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Top referrers</h2>
          <ReferrerTable data={referrers} />
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">Devices</h2>
          <DevicePieChart data={devices} />
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">Countries</h2>
          <CountryList data={countries} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
        <ActivityFeed events={events} />
      </div>
    </div>
  );
}
