import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { getUserOrganizations } from "@/lib/organizations";
import { DashboardNav } from "@/components/features/dashboard-nav";
import { MobileNav } from "@/components/features/mobile-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  // Every /dashboard/* route requires a session — enforced once, here, in the
  // shared layout rather than per-page. This isn't just deduplication: this
  // layout sits outside the Suspense boundary that dashboard/[id]/loading.tsx
  // implicitly wraps its subtree in, so a redirect() thrown from inside a
  // *page* component under a streaming loading.tsx boundary gets its status
  // code silently downgraded to 200 (confirmed directly — real bug, not a
  // hypothetical). A layout's redirect runs before any of that streaming
  // commitment, so it actually produces a real 307 instead of a 200 the
  // client happens to navigate away from.
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/dashboard");
  }
  const user = session.user;

  const memberships = await getUserOrganizations(user.id);
  const organizations = memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    isPersonal: m.organization.isPersonal,
  }));

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-full flex-1">
      {/* Desktop: a persistent sidebar is the entire chrome — no separate
          header needed, every page below already renders its own heading. */}
      <aside className="lg:bg-sidebar lg:text-sidebar-foreground lg:border-sidebar-border hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-r">
        <DashboardNav
          organizations={organizations}
          activeOrganizationId={user.organizationId}
          user={user}
          onSignOut={signOutAction}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile/tablet: the sidebar collapses into this slim sticky bar
            plus a drawer, below the lg: breakpoint where a 240px sidebar
            would crowd out real content. */}
        <header className="bg-background/80 sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3 backdrop-blur-md lg:hidden">
          <MobileNav
            organizations={organizations}
            activeOrganizationId={user.organizationId}
            user={user}
            onSignOut={signOutAction}
          />
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight transition-opacity hover:opacity-70"
          >
            Snip
          </Link>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
