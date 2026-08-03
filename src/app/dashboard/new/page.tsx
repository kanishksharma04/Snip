import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { CreateLinkForm } from "@/components/features/create-link-form";

export default async function NewLinkPage() {
  const session = await getSession();
  const organizationId = session?.user?.organizationId;
  if (!organizationId) {
    redirect("/login?callbackUrl=/dashboard/new");
  }

  // Only verified domains are offered — an unverified one can't be trusted
  // to actually route traffic, so offering it here would just be a way to
  // create a dead link.
  const verifiedDomains = await db.domain.findMany({
    where: { organizationId, verifiedAt: { not: null } },
    orderBy: { hostname: "asc" },
    select: { id: true, hostname: true },
  });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 p-6 duration-500">
      <h1 className="mb-6 text-xl font-semibold tracking-tight">Create a link</h1>
      <div className="max-w-md rounded-2xl border p-5 shadow-sm sm:p-6">
        <CreateLinkForm verifiedDomains={verifiedDomains} />
      </div>
    </div>
  );
}
