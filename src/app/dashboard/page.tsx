import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { LinksTable, LinksTableSkeleton } from "@/components/features/links-table";
import { SearchForm } from "@/components/features/search-form";
import { PaginationControls, parsePage } from "@/components/features/pagination-controls";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@tabler/icons-react";

const PAGE_SIZE = 20;

// A file-based loading.tsx at this segment would implicitly wrap this
// page *and every nested route below it* (/dashboard/new,
// /dashboard/settings, /dashboard/[id], ...) in one Suspense boundary that
// pre-commits to a 200 status as soon as it starts streaming — confirmed
// directly: it silently broke the HTTP status of every redirect()/notFound()
// anywhere in this subtree. An inline Suspense around just this page's own
// data-dependent section gets the same loading UX without that blast radius.
async function LinksSection({
  organizationId,
  query,
  page,
}: {
  organizationId: string;
  query: string;
  page: number;
}) {
  // select, not a bare findMany: destination can be up to 2048 chars and we
  // only ever render a truncated form of it. clickCount is read straight off
  // the row rather than aggregated over ClickEvent — that's the whole reason
  // Step 4 denormalized it onto Link, so this stays a single flat query.
  const where = {
    organizationId,
    ...(query
      ? {
          OR: [
            { slug: { contains: query, mode: "insensitive" as const } },
            { destination: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [links, total] = await Promise.all([
    db.link.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        destination: true,
        clickCount: true,
        createdAt: true,
        isActive: true,
        expiresAt: true,
        domain: { select: { hostname: true } },
      },
    }),
    db.link.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <LinksTable links={links} isFiltered={query.length > 0} />
      <div className="mt-4">
        <PaginationControls page={page} totalPages={totalPages} q={query} />
      </div>
    </>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  // dashboard/layout.tsx already checks this for the correct HTTP status
  // (see its comment), but layout and page render concurrently rather than
  // the layout strictly gating the page — confirmed directly: trusting a
  // non-null assertion here crashed with a real, logged TypeError instead of
  // ever reaching the layout's redirect. getSession() is React
  // cache()-wrapped, so this re-check is a dedup, not a second real query.
  const session = await getSession();
  const organizationId = session?.user?.organizationId;
  if (!organizationId) {
    redirect("/login?callbackUrl=/dashboard");
  }

  const { q, page: pageParam } = await searchParams;
  const query = q?.trim() ?? "";
  const page = parsePage(pageParam);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 p-6 duration-500">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Your links</h1>
        <Button asChild size="sm" className="group/cta gap-1.5">
          <Link href="/dashboard/new">
            <IconPlus className="size-4" />
            New link
          </Link>
        </Button>
      </div>
      <SearchForm defaultValue={query} />
      <Suspense key={`${query}-${page}`} fallback={<LinksTableSkeleton />}>
        <LinksSection organizationId={organizationId} query={query} page={page} />
      </Suspense>
    </div>
  );
}
