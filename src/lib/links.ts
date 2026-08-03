import { cache } from "react";
import { db } from "@/lib/db";

// cache() dedupes this within a single request: dashboard/[id]/layout.tsx
// calls it to decide whether to notFound(), and page.tsx calls it again to
// get the same data for rendering — without this they'd be two identical
// DB round trips instead of one.
export const getOwnedLink = cache(async (id: string, organizationId: string) => {
  return db.link.findFirst({
    where: { id, organizationId },
    select: {
      id: true,
      slug: true,
      destination: true,
      clickCount: true,
      isActive: true,
      domain: { select: { hostname: true } },
    },
  });
});
