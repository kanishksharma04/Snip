import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { LinksTable } from "@/components/features/links-table";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?callbackUrl=/dashboard");
  }

  const userId = session.user?.id;
  if (!userId) {
    redirect("/login?callbackUrl=/dashboard");
  }

  // select, not a bare findMany: destination can be up to 2048 chars and we
  // only ever render a truncated form of it. clickCount is read straight off
  // the row rather than aggregated over ClickEvent — that's the whole reason
  // Step 4 denormalized it onto Link, so this stays a single flat query.
  //
  // Unbounded for now (search/pagination land in Step 30) — at 10,000 links
  // for one user, this becomes a single unindexed-by-size page transferring
  // and rendering every row's destination string on every dashboard visit,
  // which is what actually breaks first: page weight and render time, not
  // the query itself (the userId+createdAt index keeps that fast).
  const links = await db.link.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      destination: true,
      clickCount: true,
      createdAt: true,
      isActive: true,
      expiresAt: true,
    },
  });

  return (
    <div className="p-6">
      <h1 className="mb-6 text-xl font-semibold">Your links</h1>
      <LinksTable links={links} />
    </div>
  );
}
