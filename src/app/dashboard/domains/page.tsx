import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { DomainManager } from "@/components/features/domain-manager";

export default async function DomainsPage() {
  // dashboard/layout.tsx already checks this for the correct HTTP status
  // (see its comment), but layout and page render concurrently rather than
  // the layout strictly gating the page — confirmed directly: trusting a
  // non-null assertion here crashed with a real, logged TypeError instead of
  // ever reaching the layout's redirect. getSession() is React
  // cache()-wrapped, so this re-check is a dedup, not a second real query.
  const session = await getSession();
  const organizationId = session?.user?.organizationId;
  if (!organizationId) {
    redirect("/login?callbackUrl=/dashboard/domains");
  }

  const domains = await db.domain.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, hostname: true, verifyToken: true, verifiedAt: true, createdAt: true },
  });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-6 p-6 duration-500">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Domains</h1>
        <p className="text-muted-foreground text-sm">
          Attach your own domain to short links you create. Ownership is verified with a DNS
          TXT record — you&apos;ll still need to add the domain in your hosting provider
          separately for it to actually route traffic here.
        </p>
      </div>
      <DomainManager initialDomains={domains} />
    </div>
  );
}
