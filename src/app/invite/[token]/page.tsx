import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { acceptInvite } from "@/lib/actions/organizations";
import { Button } from "@/components/ui/button";

function InviteMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground max-w-sm">{description}</p>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await db.organizationInvite.findUnique({
    where: { token },
    select: {
      expiresAt: true,
      role: true,
      organization: { select: { name: true } },
    },
  });

  if (!invite) {
    return (
      <InviteMessage
        title="This invite link isn't valid"
        description="It may have been revoked, or the link was copied incorrectly."
      />
    );
  }
  if (invite.expiresAt <= new Date()) {
    return (
      <InviteMessage
        title="This invite link has expired"
        description="Ask whoever invited you to send a new one."
      />
    );
  }

  const session = await getSession();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/invite/${token}`);
  }

  async function accept() {
    "use server";
    // KNOWN GAP: a plain <form> has nowhere to show a toast on failure (e.g.
    // the invite got revoked in the moment between this page loading and
    // being submitted) — it just re-renders this same page, which will now
    // correctly show the "not valid" message above on the next load since
    // acceptInvite doesn't throw. Acceptable: this race is rare and the
    // failure mode is a harmless no-op, not a silent wrong action.
    const result = await acceptInvite(token);
    if (result.success) {
      redirect("/dashboard");
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Join {invite.organization.name}</h1>
      <p className="text-muted-foreground max-w-sm">
        You&apos;ve been invited to join as {invite.role === "OWNER" ? "an owner" : "a member"}.
      </p>
      <form action={accept}>
        <Button type="submit">Accept invite</Button>
      </form>
    </div>
  );
}
