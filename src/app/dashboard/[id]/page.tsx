import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ActivityFeed } from "@/components/features/activity-feed";

// Minimal shell for now — just enough to host the activity feed. Step 25
// builds this out into the full detail page (header, destination, total
// clicks, copy button, active toggle). The ownership scoping below isn't a
// preview of Step 25's job; it's the only correct way to query "this link's
// clicks" at all, so it has to exist here regardless of step boundaries.
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

  const link = await db.link.findFirst({
    where: { id, userId },
    select: { id: true },
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

  return (
    <div className="p-6">
      <h1 className="mb-6 text-xl font-semibold">Recent activity</h1>
      <ActivityFeed events={events} />
    </div>
  );
}
