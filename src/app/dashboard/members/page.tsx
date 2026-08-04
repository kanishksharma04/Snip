import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { MemberManager } from "@/components/features/member-manager";

export default async function MembersPage() {
  // dashboard/layout.tsx already checks this for the correct HTTP status
  // (see its comment), but layout and page render concurrently rather than
  // the layout strictly gating the page — confirmed directly: trusting a
  // non-null assertion here crashed with a real, logged TypeError instead of
  // ever reaching the layout's redirect. getSession() is React
  // cache()-wrapped, so this re-check is a dedup, not a second real query.
  const session = await getSession();
  const userId = session?.user?.id;
  const organizationId = session?.user?.organizationId;
  if (!userId || !organizationId) {
    redirect("/login?callbackUrl=/dashboard/members");
  }

  const [organization, members, invites] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { isPersonal: true },
    }),
    db.organizationMember.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    }),
    db.organizationInvite.findMany({
      where: { organizationId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, role: true, token: true, expiresAt: true },
    }),
  ]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-6 p-6 duration-500">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Members</h1>
        <p className="text-muted-foreground text-sm">
          Everyone here can see and manage this organization&apos;s links, domains, and API
          keys. Only owners can invite, remove, or promote members.
        </p>
      </div>
      <MemberManager
        initialMembers={members}
        initialInvites={invites}
        viewerRole={session.user.role}
        viewerUserId={userId}
        isPersonal={organization.isPersonal}
      />
    </div>
  );
}
