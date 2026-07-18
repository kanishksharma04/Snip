import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { LinksTable } from "@/components/features/links-table";
import { SearchForm } from "@/components/features/search-form";
import { PaginationControls, parsePage } from "@/components/features/pagination-controls";

const PAGE_SIZE = 20;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login?callbackUrl=/dashboard");
  }

  const userId = session.user?.id;
  if (!userId) {
    redirect("/login?callbackUrl=/dashboard");
  }

  const { q, page: pageParam } = await searchParams;
  const query = q?.trim() ?? "";
  const page = parsePage(pageParam);

  // select, not a bare findMany: destination can be up to 2048 chars and we
  // only ever render a truncated form of it. clickCount is read straight off
  // the row rather than aggregated over ClickEvent — that's the whole reason
  // Step 4 denormalized it onto Link, so this stays a single flat query.
  const where = {
    userId,
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
      },
    }),
    db.link.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6">
      <h1 className="mb-6 text-xl font-semibold">Your links</h1>
      <SearchForm defaultValue={query} />
      <LinksTable links={links} isFiltered={query.length > 0} />
      <div className="mt-4">
        <PaginationControls page={page} totalPages={totalPages} q={query} />
      </div>
    </div>
  );
}
